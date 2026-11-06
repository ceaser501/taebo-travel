package app.ttakbok.steps

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

// The same Supabase project as 딱복트립 (the publishable key is public, like in the web app).
private const val URL_BASE = "https://gxyckkinlygeasruapmj.supabase.co"
private const val API_KEY = "sb_publishable__NKAf1NZsOddwbkgqYGTbw_Smez0lcv"

class ApiError(val code: Int, msg: String) : Exception(msg)

/** Signing in, keeping the session, and saving the day's steps into the trip. */
class Trip(context: Context) {
    private val prefs = context.getSharedPreferences("trip", Context.MODE_PRIVATE)

    val signedIn get() = prefs.getString("refresh", null) != null
    val email get() = prefs.getString("email", "") ?: ""
    var lastSent: String
        get() = prefs.getString("lastSent", "") ?: ""
        set(v) = prefs.edit().putString("lastSent", v).apply()

    private fun call(method: String, path: String, body: String?, token: String?, extra: Map<String, String> = emptyMap()): String {
        val c = URL(URL_BASE + path).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 15000
        c.readTimeout = 20000
        c.setRequestProperty("apikey", API_KEY)
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("Authorization", "Bearer " + (token ?: API_KEY))
        extra.forEach { (k, v) -> c.setRequestProperty(k, v) }
        if (body != null) {
            c.doOutput = true
            c.outputStream.use { it.write(body.toByteArray()) }
        }
        val code = c.responseCode
        val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        if (code >= 400) throw ApiError(code, text)
        return text
    }

    private fun keep(j: JSONObject) {
        prefs.edit()
            .putString("access", j.getString("access_token"))
            .putString("refresh", j.getString("refresh_token"))
            .putLong("expires", Instant.now().epochSecond + j.optLong("expires_in", 3600) - 60)
            .putString("uid", j.getJSONObject("user").getString("id"))
            .apply()
    }

    /** Sign in with the same email and password as 딱복트립, then find the trip. */
    fun signIn(email: String, password: String) {
        val j = JSONObject(call("POST", "/auth/v1/token?grant_type=password",
            JSONObject().put("email", email).put("password", password).toString(), null))
        keep(j)
        prefs.edit().putString("email", email).apply()
        val uid = prefs.getString("uid", "")!!
        val rows = JSONArray(call("GET", "/rest/v1/trip_members?select=trip_id&user_id=eq.$uid&order=joined_at.desc&limit=1", null, token()))
        if (rows.length() == 0) { signOut(); throw ApiError(404, "no-trip") }
        prefs.edit().putString("trip", rows.getJSONObject(0).getString("trip_id")).apply()
    }

    fun signOut() = prefs.edit().clear().apply()

    /** A valid access token, refreshed when it has expired. */
    private fun token(): String {
        if (Instant.now().epochSecond < prefs.getLong("expires", 0)) return prefs.getString("access", "")!!
        val refresh = prefs.getString("refresh", null) ?: throw ApiError(401, "signed-out")
        keep(JSONObject(call("POST", "/auth/v1/token?grant_type=refresh_token", JSONObject().put("refresh_token", refresh).toString(), null)))
        return prefs.getString("access", "")!!
    }

    /** Save steps per day (date "2026-11-19" → steps). One row per person and day; newer counts replace older ones. */
    fun sendSteps(days: Map<String, Long>) {
        val uid = prefs.getString("uid", null) ?: throw ApiError(401, "signed-out")
        val trip = prefs.getString("trip", null) ?: throw ApiError(404, "no-trip")
        val now = Instant.now().toString()
        val rows = JSONArray()
        days.forEach { (date, steps) ->
            rows.put(JSONObject()
                .put("trip_id", trip).put("kind", "steps").put("id", "$uid:$date")
                .put("data", JSONObject().put("who", uid).put("date", date).put("steps", steps).put("at", now))
                .put("deleted", false).put("updated_at", now).put("updated_by", uid))
        }
        call("POST", "/rest/v1/trip_items?on_conflict=trip_id,kind,id", rows.toString(), token(),
            mapOf("Prefer" to "resolution=merge-duplicates,return=minimal"))
    }
}
