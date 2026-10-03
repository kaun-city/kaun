/** One shared deadline bounds an entire sequence of upstream requests. */
export function deadlineFetch(milliseconds: number): typeof fetch {
  const deadline = AbortSignal.timeout(milliseconds)
  return (input, init) => fetch(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline,
  })
}

/** Bounds SDK retries and response-body work as well as the initial fetch. */
export async function withDeadline<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new DOMException("Operation timed out", "TimeoutError")), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
