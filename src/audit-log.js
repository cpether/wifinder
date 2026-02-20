export function createAuditLog() {
  const events = [];

  function record(event) {
    events.push({
      ...event,
      timestamp: new Date().toISOString()
    });
  }

  return {
    record,
    all() {
      return [...events];
    }
  };
}
