package com.partyspeaker

import android.Manifest
import android.content.pm.PackageManager
import android.media.audiofx.Visualizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.math.ln
import kotlin.math.sqrt

class PartySpectrumModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val RECORD_AUDIO_REQUEST_CODE = 9182
        private const val BAR_COUNT = 28
    }

    private var visualizer: Visualizer? = null
    private var permissionRequestIssued = false
    private val previousBars = DoubleArray(BAR_COUNT) { 0.04 }

    override fun getName(): String = "PartySpectrum"

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    @ReactMethod
    fun startSpectrum(promise: Promise) {
        if (reactContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            val activity = reactContext.currentActivity
            if (activity == null) {
                promise.resolve("permission_unavailable")
                return
            }

            if (!permissionRequestIssued) {
                permissionRequestIssued = true
                activity.requestPermissions(
                    arrayOf(Manifest.permission.RECORD_AUDIO),
                    RECORD_AUDIO_REQUEST_CODE,
                )
                promise.resolve("permission_requested")
            } else {
                promise.resolve("permission_waiting")
            }
            return
        }

        permissionRequestIssued = false

        if (visualizer?.enabled == true) {
            promise.resolve("started")
            return
        }

        try {
            stopVisualizer()

            val analyser = Visualizer(0)
            analyser.enabled = false

            val captureRange = Visualizer.getCaptureSizeRange()
            analyser.captureSize = captureRange[1].coerceAtMost(1024)
            analyser.scalingMode = Visualizer.SCALING_MODE_NORMALIZED

            val captureRate = (Visualizer.getMaxCaptureRate() / 2).coerceAtLeast(1000)
            analyser.setDataCaptureListener(
                object : Visualizer.OnDataCaptureListener {
                    override fun onWaveFormDataCapture(
                        visualizer: Visualizer?,
                        waveform: ByteArray?,
                        samplingRate: Int,
                    ) {
                        // FFT capture is used for the spectrum display.
                    }

                    override fun onFftDataCapture(
                        visualizer: Visualizer?,
                        fft: ByteArray?,
                        samplingRate: Int,
                    ) {
                        if (fft == null || fft.size < 8) return
                        emitSpectrum(calculateBars(fft, samplingRate))
                    }
                },
                captureRate,
                false,
                true,
            )

            analyser.enabled = true
            visualizer = analyser
            promise.resolve("started")
        } catch (error: Throwable) {
            stopVisualizer()
            promise.reject("SPECTRUM_START_ERROR", error)
        }
    }

    @ReactMethod
    fun stopSpectrum(promise: Promise) {
        stopVisualizer()
        promise.resolve(true)
    }

    private fun calculateBars(fft: ByteArray, samplingRateMilliHz: Int): DoubleArray {
        val fftSize = fft.size
        val binCount = fftSize / 2
        val sampleRateHz = (samplingRateMilliHz / 1000.0).coerceAtLeast(8000.0)
        val nyquist = sampleRateHz / 2.0
        val minFrequency = 45.0
        val maxFrequency = minOf(18000.0, nyquist * 0.96)

        val sums = DoubleArray(BAR_COUNT)
        val counts = IntArray(BAR_COUNT)

        for (bin in 1 until binCount) {
            val realIndex = bin * 2
            val imagIndex = realIndex + 1
            if (imagIndex >= fft.size) break

            val frequency = bin * sampleRateHz / fftSize
            if (frequency < minFrequency || frequency > maxFrequency) continue

            val real = fft[realIndex].toDouble()
            val imaginary = fft[imagIndex].toDouble()
            val magnitude = sqrt(real * real + imaginary * imaginary)

            val logPosition =
                ln(frequency / minFrequency) / ln(maxFrequency / minFrequency)
            val barIndex = (logPosition * BAR_COUNT)
                .toInt()
                .coerceIn(0, BAR_COUNT - 1)

            sums[barIndex] += magnitude * magnitude
            counts[barIndex] += 1
        }

        val result = DoubleArray(BAR_COUNT)

        for (index in 0 until BAR_COUNT) {
            val rms = if (counts[index] > 0) {
                sqrt(sums[index] / counts[index])
            } else {
                0.0
            }

            // FFT values from Android's Visualizer are 8-bit magnitudes.
            // Log compression keeps quieter frequency bands visible while still
            // allowing drum/bass transients to punch through immediately.
            var level = (ln(1.0 + rms) / ln(1.0 + 110.0)).coerceIn(0.0, 1.0)
            level = ((level - 0.12) / 0.88).coerceIn(0.0, 1.0)

            // Small low-end compensation makes the spectrum read naturally on
            // phone speakers without turning every track into a bass meter.
            if (index < BAR_COUNT / 3) {
                level = (level * 1.08).coerceAtMost(1.0)
            }

            val previous = previousBars[index]
            val smoothed = if (level >= previous) {
                previous * 0.20 + level * 0.80 // fast attack
            } else {
                previous * 0.78 + level * 0.22 // slower decay
            }

            previousBars[index] = smoothed
            result[index] = smoothed.coerceIn(0.025, 1.0)
        }

        return result
    }

    private fun emitSpectrum(bars: DoubleArray) {
        val array = Arguments.createArray()
        bars.forEach { array.pushDouble(it) }

        val event = Arguments.createMap()
        event.putArray("bars", array)

        reactContext.runOnUiQueueThread {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("PartySpectrumFFT", event)
        }
    }

    private fun stopVisualizer() {
        try {
            visualizer?.enabled = false
        } catch (_: Throwable) {}

        try {
            visualizer?.release()
        } catch (_: Throwable) {}

        visualizer = null
        previousBars.fill(0.04)
    }

    override fun invalidate() {
        stopVisualizer()
        super.invalidate()
    }
}
