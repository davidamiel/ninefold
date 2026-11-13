// Use actual GPU capability on phones as well as desktops. Browser identity alone
// must not force a capable device onto the much slower CPU execution path.
export async function loadVoice({device, create, notify, forceCPU = false}) {
  const options = {progress_callback: progress => notify({type: 'progress', progress})};
  if (!forceCPU) {
    try {
      const adapter = await device.gpu?.requestAdapter();
      if (adapter) {
        notify({type: 'backend', device: 'webgpu'});
        // Half-precision Kokoro models produced non-finite samples in WebKit.
        return await create({...options, dtype: 'fp32', device: 'webgpu'});
      }
    } catch { /* Unsupported GPU model/device falls back to quantized CPU. */ }
  }
  notify({type: 'backend', device: 'wasm'});
  return create({...options, dtype: 'q8', device: 'wasm'});
}

export function validSpeech(samples) {
  if (!samples?.length) return false;
  let energy = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample) || Math.abs(sample) > 4) return false;
    energy += sample * sample;
  }
  return energy / samples.length > 1e-10;
}
