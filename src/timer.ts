// Returns a promise that does not resolve until the provided number of milliseconds has passed.
export async function timer(time: number): Promise<void> {
  return new Promise((resolve): void => {
    setTimeout(() => {
      resolve();
    }, time);
  });
}