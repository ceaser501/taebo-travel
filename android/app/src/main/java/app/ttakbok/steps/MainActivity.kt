package app.ttakbok.steps

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.NumberFormat

/**
 * One screen: sign in with the 딱복트립 account, allow reading steps, and see what was last sent.
 * After that it sends steps every hour by itself; the app doesn't need to be opened again.
 */
class MainActivity : ComponentActivity() {
    private val ink = Color.parseColor("#2B2F45")
    private val accent = Color.parseColor("#5A6FE3")
    private val mute = Color.parseColor("#6B7090")
    private lateinit var box: LinearLayout
    private lateinit var askPermission: ActivityResultLauncher<Set<String>>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        askPermission = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { draw() }
        box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(22), dp(36), dp(22), dp(36)) }
        setContentView(ScrollView(this).apply { setBackgroundColor(Color.parseColor("#F4F5FC")); addView(box) })
    }

    override fun onResume() { super.onResume(); draw() }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun text(s: String, size: Float = 15f, color: Int = ink, bold: Boolean = false) = TextView(this).apply {
        text = s; textSize = size; setTextColor(color); if (bold) typeface = Typeface.DEFAULT_BOLD
        setPadding(0, dp(6), 0, dp(6)); setLineSpacing(0f, 1.25f)
    }
    private fun button(label: String, primary: Boolean = true, onClick: () -> Unit) = Button(this).apply {
        text = label; textSize = 16f; isAllCaps = false; setTextColor(if (primary) Color.WHITE else accent)
        background = GradientDrawable().apply { cornerRadius = dp(14).toFloat(); setColor(if (primary) accent else Color.parseColor("#E6E9FB")) }
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(52)).apply { topMargin = dp(10) }
        setOnClickListener { onClick() }
    }
    private fun field(hint: String, password: Boolean) = EditText(this).apply {
        this.hint = hint; textSize = 16f; setSingleLine()
        inputType = if (password) InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD else InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        background = GradientDrawable().apply { cornerRadius = dp(12).toFloat(); setColor(Color.WHITE); setStroke(dp(1), Color.parseColor("#DCDFF0")) }
        setPadding(dp(14), dp(12), dp(14), dp(12))
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) }
    }

    private fun draw() {
        box.removeAllViews()
        box.addView(text("딱복 걸음", 26f, ink, true))
        box.addView(text("삼성 헬스의 걸음 수를 딱복트립 일정에 자동으로 보내요.", 15f, mute))
        val trip = Trip(this)

        if (!Steps.available(this)) {
            box.addView(text("이 휴대폰에 Health Connect가 없어요. 설치한 뒤 다시 열어 주세요.", 15f, ink))
            box.addView(button("Health Connect 설치") {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata")))
            })
            return
        }

        if (!trip.signedIn) {
            box.addView(text("딱복트립과 같은 이메일 · 비밀번호로 로그인해 주세요.", 15f, ink, true))
            val email = field("이메일", false); val pw = field("비밀번호", true)
            val err = text("", 14f, Color.parseColor("#C0392B")).apply { visibility = View.GONE }
            box.addView(email); box.addView(pw); box.addView(err)
            box.addView(button("로그인") {
                lifecycleScope.launch {
                    try {
                        withContext(Dispatchers.IO) { trip.signIn(email.text.toString().trim(), pw.text.toString()) }
                        draw()
                    } catch (e: ApiError) {
                        err.visibility = View.VISIBLE
                        err.text = if (e.message == "no-trip") "이 계정에 연결된 여행이 없어요." else "이메일이나 비밀번호가 달라요."
                    } catch (e: Exception) {
                        err.visibility = View.VISIBLE; err.text = "인터넷 연결을 확인해 주세요."
                    }
                }
            })
            return
        }

        box.addView(text("로그인: ${trip.email}", 14f, mute))
        lifecycleScope.launch {
            val granted = Steps.granted(this@MainActivity)
            if (Steps.READ !in granted) {
                box.addView(text("걸음 수를 읽을 수 있게 허락해 주세요.", 16f, ink, true))
                box.addView(text("먼저 삼성 헬스 → 설정 → Health Connect에서 걸음 수 공유를 켜 두세요.", 14f, mute))
                box.addView(button("걸음 수 읽기 허락") {
                    val want = mutableSetOf(Steps.READ)
                    if (Steps.backgroundSupported(this@MainActivity)) want += Steps.BACKGROUND
                    askPermission.launch(want)
                })
                return@launch
            }
            Steps.schedule(this@MainActivity)
            val status = text("보내는 중…", 15f, ink)
            box.addView(text("자동으로 보내고 있어요", 17f, accent, true))
            box.addView(status)
            if (Steps.backgroundSupported(this@MainActivity) && Steps.BACKGROUND !in granted) {
                box.addView(text("앱을 닫아도 보내려면 「항상 허용(백그라운드)」도 허락해 주세요.", 14f, mute))
                box.addView(button("백그라운드에서도 허락", false) { askPermission.launch(setOf(Steps.READ, Steps.BACKGROUND)) })
            }
            box.addView(button("지금 보내기", false) { lifecycleScope.launch { send(status) } })
            box.addView(button("로그아웃", false) { trip.signOut(); draw() })
            box.addView(text("15분마다 오늘과 지난 이틀의 걸음 수를 보내요. 딱복트립 걸음 수 화면의 「새로 받기」로 바로 보낼 수도 있어요.", 13f, mute).apply { gravity = Gravity.START })
            send(status)
        }
    }

    private suspend fun send(status: TextView) {
        status.text = "보내는 중…"
        try {
            val today = withContext(Dispatchers.IO) { Steps.sync(this@MainActivity) }
            status.text = "오늘 ${NumberFormat.getInstance().format(today)}보 · ${Trip(this).lastSent}에 보냄"
        } catch (e: Exception) {
            status.text = "보내지 못했어요. 인터넷을 확인해 주세요." + (Trip(this).lastSent.takeIf { it.isNotEmpty() }?.let { " (마지막: $it)" } ?: "")
        }
    }
}
