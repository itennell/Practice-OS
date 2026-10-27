import { describe, expect, it } from "vitest";
import { DICTATION_RATE, encodeWav } from "../components/shared/dictation-audio";

describe("dictation WAV encoding", () => {
  const wav = new DataView(encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1, 2]), DICTATION_RATE));
  const text = (at: number, n: number) => String.fromCharCode(...Array.from({ length: n }, (_, i) => wav.getUint8(at + i)));

  it("writes a mono 16-bit PCM header at 24 kHz", () => {
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(wav.getUint16(20, true)).toBe(1); // PCM
    expect(wav.getUint16(22, true)).toBe(1); // mono
    expect(wav.getUint32(24, true)).toBe(24_000);
    expect(wav.getUint16(34, true)).toBe(16);
    expect(wav.getUint32(40, true)).toBe(12); // 6 samples × 2 bytes
    expect(wav.byteLength).toBe(44 + 12);
  });

  it("scales samples to 16-bit and clips anything past full scale", () => {
    expect(wav.getInt16(44, true)).toBe(0);
    expect(wav.getInt16(46, true)).toBe(16383);
    expect(wav.getInt16(48, true)).toBe(-16384);
    expect(wav.getInt16(50, true)).toBe(32767);
    expect(wav.getInt16(52, true)).toBe(-32768);
    expect(wav.getInt16(54, true)).toBe(32767);
  });
});
