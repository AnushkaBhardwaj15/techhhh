import { type Consumer, type EachMessagePayload } from 'kafkajs';
import { getKafka, publishEvent } from './producer.ts';
import { type KafkaTopic, type TombolaEvent, KAFKA_TOPICS } from '../../events/schemas.ts';

export type EventHandler = (event: TombolaEvent) => Promise<void>;

interface ConsumerOptions {
  groupId: string;
  topics: KafkaTopic[];
  handlers: Map<string, EventHandler>;
}

const processedEvents = new Set<string>();

export function isEventProcessed(eventId: string): boolean {
  return processedEvents.has(eventId);
}

export function markEventProcessed(eventId: string): void {
  processedEvents.add(eventId);
  // Keep size bounded in memory
  if (processedEvents.size > 10000) {
    const oldest = processedEvents.values().next().value;
    if (oldest) processedEvents.delete(oldest);
  }
}

export function createKafkaConsumer(options: ConsumerOptions): {
  start: () => Promise<Consumer | null>;
  stop: () => Promise<void>;
} {
  const kafka = getKafka();
  let consumer: Consumer | null = null;

  async function start(): Promise<Consumer | null> {
    if (!kafka) return null;

    try {
      consumer = kafka.consumer({ groupId: options.groupId });
      await consumer.connect();

      for (const topic of options.topics) {
        await consumer.subscribe({ topic, fromBeginning: false });
      }

      await consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          const { topic, message } = payload;
          if (!message.value) return;

          let parsed: TombolaEvent;
          try {
            parsed = JSON.parse(message.value.toString()) as TombolaEvent;
          } catch (err) {
            console.error('[KAFKA_CONSUMER_PARSE_ERROR] Invalid JSON payload', err);
            return;
          }

          if (isEventProcessed(parsed.eventId)) {
            // Deduplicate replay
            return;
          }

          const handler = options.handlers.get(parsed.type);
          if (handler) {
            let attempt = 0;
            const maxRetries = 3;
            let success = false;

            while (attempt < maxRetries && !success) {
              try {
                attempt++;
                await handler(parsed);
                markEventProcessed(parsed.eventId);
                success = true;
              } catch (err) {
                console.warn(`[KAFKA_CONSUMER_HANDLER_RETRY] Attempt ${attempt} failed for event ${parsed.eventId}`, err);
                if (attempt < maxRetries) {
                  await new Promise((r) => setTimeout(r, attempt * 200));
                }
              }
            }

            if (!success) {
              console.error(`[KAFKA_DEAD_LETTER] Event ${parsed.eventId} exhausted retries, forwarding to dead-letter`);
              await publishEvent(
                KAFKA_TOPICS.DEAD_LETTER,
                parsed.eventId,
                parsed
              );
            }
          }
        },
      });

      return consumer;
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[KAFKA_CONSUMER_START_WARNING] Could not start Kafka consumer', err);
      }
      return null;
    }
  }

  async function stop(): Promise<void> {
    if (consumer) {
      try {
        await consumer.disconnect();
      } catch {
        // Ignore disconnect errors
      } finally {
        consumer = null;
      }
    }
  }

  return { start, stop };
}
