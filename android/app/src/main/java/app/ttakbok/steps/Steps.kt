package app.ttakbok.steps

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

/** Reading steps from Health Connect (Samsung Health shares its steps there when that is turned on). */
object Steps {
    val READ = HealthPermission.getReadPermission(StepsRecord::class)
    const val BACKGROUND = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

    fun available(ctx: Context) = HealthConnectClient.getSdkStatus(ctx) == HealthConnectClient.SDK_AVAILABLE

    suspend fun granted(ctx: Context): Set<String> =
        HealthConnectClient.getOrCreate(ctx).permissionController.getGrantedPermissions()

    /** Whether this phone's Health Connect lets apps read while they are closed. */
    fun backgroundSupported(ctx: Context): Boolean =
        HealthConnectClient.getOrCreate(ctx).features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) ==
            HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

    /** Steps for today and the two days before, in the phone's time zone (Japan time while travelling). */
    suspend fun lastDays(ctx: Context, n: Int = 3): Map<String, Long> {
        val client = HealthConnectClient.getOrCreate(ctx)
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val out = linkedMapOf<String, Long>()
        for (i in n - 1 downTo 0) {
            val day = today.minusDays(i.toLong())
            val start = day.atStartOfDay(zone).toInstant()
            val end = if (i == 0) ZonedDateTime.now(zone).toInstant() else day.plusDays(1).atStartOfDay(zone).toInstant()
            val r = client.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(start, end)))
            out[day.format(DateTimeFormatter.ISO_LOCAL_DATE)] = r[StepsRecord.COUNT_TOTAL] ?: 0L
        }
        return out
    }

    /** Read and send now; returns today's steps. */
    suspend fun sync(ctx: Context): Long {
        val days = lastDays(ctx)
        Trip(ctx).sendSteps(days)
        Trip(ctx).lastSent = ZonedDateTime.now().format(DateTimeFormatter.ofPattern("M월 d일 HH:mm"))
        return days.values.last()
    }

    /** Send every hour while there is internet, even when the app is closed. */
    fun schedule(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("steps", ExistingPeriodicWorkPolicy.UPDATE, req)
    }
}

class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result = try {
        if (!Trip(applicationContext).signedIn) Result.success()
        else { Steps.sync(applicationContext); Result.success() }
    } catch (e: Exception) {
        Result.retry()
    }
}
