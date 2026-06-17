let realtimeTopicCounter = 0;

export function createRealtimeTopic(scope: string, id: string): string {
  realtimeTopicCounter += 1;
  const randomSuffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${realtimeTopicCounter}`;

  return `${scope}-${id}-${randomSuffix}`;
}
