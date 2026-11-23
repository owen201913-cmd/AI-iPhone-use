/** A single cleanup barrier shared by EOF, SIGTERM and SIGINT. */
export function createHostCleanup({ services, exit, report = () => {} }) {
  let pending;
  return function cleanup() {
    if (pending) return pending;
    pending = Promise.resolve().then(async () => {
      // A synchronous close error must not prevent other owners from closing.
      const outcomes = await Promise.allSettled(
        services.map(service => Promise.resolve().then(() => service.closeAll())),
      );
      const failed = outcomes.some(outcome => outcome.status === 'rejected');
      if (failed) report('iPhone host shutdown could not confirm cleanup of all owned services.');
      exit(failed ? 1 : 0);
    });
    return pending;
  };
}
