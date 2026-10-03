/** One shared deadline bounds an entire sequence of upstream requests. */
export function deadlineFetch(milliseconds: number): typeof fetch {
  const deadline = AbortSignal.timeout(milliseconds)
  return (input, init) => fetch(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline,
  })
}
