/**
 * pcm-processor.js — AudioWorklet that captures mic audio and converts it to
 * PCM16 at 24 kHz (the Voice Agent API's required input format), resampling
 * linearly from the context's actual device rate. Written in plain JS because
 * audioWorklet.addModule loads it as a URL, not through the bundler.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.inputSampleRate = opts.inputSampleRate || sampleRate;
    this.targetSampleRate = opts.targetSampleRate || 24000;
    this.ratio = this.inputSampleRate / this.targetSampleRate;
    this.carry = 0; // fractional-sample position carry
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) return true;

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
