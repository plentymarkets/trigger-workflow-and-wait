export async function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    if (isNaN(milliseconds)) {
      throw new Error('milliseconds not a number')
    }

    setTimeout(() => resolve(), milliseconds)
  })
}
