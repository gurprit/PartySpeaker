package com.partyspeaker

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * Pass-through PCM analyser for PartySpeaker.
 *
 * The processor never changes sample count, timing or sample values. It only
 * observes decoded PCM frames on ExoPlayer's audio thread and periodically
 * calculates 28 logarithmically spaced frequency bands for the UI.
 */
class SpectrumAudioProcessor(
    private val onSpectrum: (DoubleArray) -> Unit,
) : BaseAudioProcessor() {

    companion object {
        private const val BAR_COUNT = 28
        private const val WINDOW_SIZE = 2048
    }

    private var sampleRate = 44100
    private var channelCount = 2
    private val monoWindow = DoubleArray(WINDOW_SIZE)
    private var windowPosition = 0
    private val previousBars = DoubleArray(BAR_COUNT) { 0.025 }

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) {
            throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
        }
        sampleRate = inputAudioFormat.sampleRate
        channelCount = inputAudioFormat.channelCount.coerceAtLeast(1)
        return inputAudioFormat
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        if (!inputBuffer.hasRemaining()) return

        // Analyse a duplicate so the original buffer can be passed through
        // byte-for-byte and with identical timing.
        val analysis = inputBuffer.duplicate().order(ByteOrder.LITTLE_ENDIAN)
        val bytesPerFrame = channelCount * 2

        while (analysis.remaining() >= bytesPerFrame) {
            var sum = 0.0
            repeat(channelCount) {
                sum += analysis.short.toDouble()
            }
            monoWindow[windowPosition++] = sum / channelCount

            if (windowPosition == WINDOW_SIZE) {
                onSpectrum(calculateSpectrum())
                windowPosition = 0
            }
        }

        val output = replaceOutputBuffer(inputBuffer.remaining())
        output.put(inputBuffer)
        output.flip()
    }

    private fun calculateSpectrum(): DoubleArray {
        val result = DoubleArray(BAR_COUNT)
        val minFrequency = 45.0
        val maxFrequency = minOf(16000.0, sampleRate * 0.46)
        val ratio = maxFrequency / minFrequency

        for (bar in 0 until BAR_COUNT) {
            val fraction = (bar + 0.5) / BAR_COUNT
            val frequency = minFrequency * Math.pow(ratio, fraction)
            val omega = 2.0 * PI * frequency / sampleRate
            val coefficient = 2.0 * cos(omega)

            var q0: Double
            var q1 = 0.0
            var q2 = 0.0

            for (index in 0 until WINDOW_SIZE) {
                // Hann window reduces spectral leakage without changing audio,
                // because this multiplication is performed only on our copy.
                val hann = 0.5 - 0.5 * cos(2.0 * PI * index / (WINDOW_SIZE - 1))
                q0 = monoWindow[index] * hann + coefficient * q1 - q2
                q2 = q1
                q1 = q0
            }

            val power = (q1 * q1 + q2 * q2 - coefficient * q1 * q2).coerceAtLeast(0.0)
            val magnitude = sqrt(power) / (WINDOW_SIZE * 0.5)
            val db = 20.0 * log10((magnitude / 32768.0).coerceAtLeast(1e-7))

            // Music normally occupies roughly -70..-8 dBFS in individual
            // narrow bands. Log mapping keeps detail visible without making
            // silence dance.
            var level = ((db + 70.0) / 62.0).coerceIn(0.0, 1.0)
            level = sqrt(level)

            val previous = previousBars[bar]
            val smoothed = if (level >= previous) {
                previous * 0.12 + level * 0.88
            } else {
                previous * 0.72 + level * 0.28
            }
            previousBars[bar] = smoothed
            result[bar] = smoothed.coerceIn(0.015, 1.0)
        }

        return result
    }

    override fun onFlush() {
        windowPosition = 0
        monoWindow.fill(0.0)
        previousBars.fill(0.025)
    }

    override fun onReset() {
        onFlush()
    }
}
