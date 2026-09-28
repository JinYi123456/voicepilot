/**
 * pcm-processor.js — AudioWorklet that captures mic audio and converts it to
 * PCM16 at 24 kHz (the Voice Agent API's required input format), resampling
 * linearly from the context's actual device rate. Written in plain JS because
 * audioWorklet.addModule loads it as a URL, not through the bundler.
 *
 * DIAGNOSTIC MODE: posts a "diag-first" message when the first block arrives
 * (proves process() is running) and a "diag" heartbeat roughly every second
 * with blocks/sec, non-silent blocks/sec and peak level (proves whether the
 * mic is delivering actual signal or pure digital silence).
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.inputSampleRate = opts.inputSampleRate || sampleRate;
    this.targetSampleRate = opts.targetSampleRate || 24000;
    this.ratio = this.inputSampleRate / this.targetSampleRate;
    this.carry = 0; // fractional-sample position carry

    // --- diagnostics ---
    this.blockCount = 0; // total process() calls with data
    this.blocksSinceDiag = 0;
    this.nonZeroSinceDiag = 0; // blocks with audible signal (> 1e-4)
    this.peakSinceDiag = 0;
    this.lastDiagFrame = 0;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) return true;

    this.blockCount++;
    this.blocksSinceDiag++;

    // Measure the block's peak level to distinguish "running but silent"
    // from "running with real mic signal".
    let blockPeak = 0;
    for (let i = 0; i < input.length; i++) {
      const v = input[i] < 0 ? -input[i] : input[i];
      if (v > blockPeak) blockPeak = v;
    }
    if (blockPeak > this.peakSinceDiag) this.peakSinceDiag = blockPeak;
    if (blockPeak > 1e-4) this.nonZeroSinceDiag++;

    if (this.blockCount === 1) {
      // First block ever — proves the node is in the live audio graph.
      this.port.postMessage({ type: "diag-first", inputSampleRate: this.inputSampleRate });
    }

    // ~1 second heartbeat (currentFrame/sampleRate = context time in seconds)
    if (currentFrame - this.lastDiagFrame >= sampleRate) {
      this.lastDiagFrame = currentFrame;
      this.port.postMessage({
        type: "diag",
        blocksPerSec: this.blocksSinceDiag,
        nonZeroBlocksPerSec: this.nonZeroSinceDiag,
        peak: Math.round(this.peakSinceDiag * 1000) / 1000,
        inputSampleRate: this.inputSampleRate,
        targetSampleRate: this.targetSampleRate,
      });
      this.blocksSinceDiag = 0;
      this.nonZeroSinceDiag = 0;
      this.peakSinceDiag = 0;
    }

    const outLength = Math.floor((input.length + this.carry) / this.ratio) || 0;
    if (outLength <= 0) {
      this.carry += input.length;
      return true;
    }

    const pcm16 = new Int16Array(outLength);
    for (let i = 0; i < outLength; i++) {
      // Linear interpolation between neighbouring samples.
      const pos = i * this.ratio - this.carry;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const a = input[idx] ?? 0;
      const b = input[idx + 1] ?? a;
      const sample = a + (b - a) * frac;
      pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    }
    // carry the unused fraction into the next block
    this.carry = (this.carry + input.length) - outLength * this.ratio;
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
