// Mobile GPU support does not imply enough memory for the full precision model.
// Use the quantized CPU model on phones, tablets and memory-constrained devices.
export function useCompactVoice(device) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(device.userAgent || '') ||
    (/Mac/i.test(device.platform || '') && device.maxTouchPoints > 1) ||
    (device.deviceMemory > 0 && device.deviceMemory <= 4);
}

export async function loadVoice({device, create, notify}) {
  const options = {progress_callback: progress => notify({type: 'progress', progress})};
  if (!useCompactVoice(device)) {
    try {
      const adapter = await device.gpu?.requestAdapter();
      if (adapter) {
        notify({type: 'backend', device: 'webgpu'});
        return await create({...options, dtype: 'fp32', device: 'webgpu'});
      }
    } catch { /* A rejected adapter or GPU model falls back to the CPU. */ }
  }
  notify({type: 'backend', device: 'wasm'});
  return create({...options, dtype: 'q8', device: 'wasm'});
}
