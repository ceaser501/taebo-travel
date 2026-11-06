package app.ttakbok.steps

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.NumberFormat

/**
 * Opened from 딱복트립's 「새로 받기」 button (ttakbok://sync). It has no screen of its own:
 * it reads today's steps while it is in front (so Health Connect allows it), sends them, and closes,
 * which brings 딱복트립 back.
 */
class SyncActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val trip = Trip(this)
        if (!trip.signedIn || !Steps.available(this)) {
            startActivity(Intent(this, MainActivity::class.java)); finish(); return
        }
        lifecycleScope.launch {
            try {
                if (Steps.READ !in Steps.granted(this@SyncActivity)) {
                    startActivity(Intent(this@SyncActivity, MainActivity::class.java))
                } else {
                    val today = withContext(Dispatchers.IO) { Steps.sync(this@SyncActivity) }
                    Toast.makeText(this@SyncActivity, "걸음 수를 보냈어요 · 오늘 ${NumberFormat.getInstance().format(today)}보", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@SyncActivity, "보내지 못했어요. 인터넷을 확인해 주세요.", Toast.LENGTH_SHORT).show()
            }
            finish()
        }
    }
}
