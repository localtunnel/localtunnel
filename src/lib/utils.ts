export const sleep = (ts: number) => new Promise<void>((resolve) => setTimeout(() => resolve(), ts))
