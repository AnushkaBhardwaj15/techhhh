import { Kafka, type Producer, logLevel } from 'kafkajs';
import { getEnv } from '../../config/env.ts';
import { type KafkaTopic, type TombolaEvent, KAFKA_TOPICS } from '../../events/schemas.ts';

let kafkaInstance: Kafka | null = null;
let kafkaProducer: Producer | null = null;
let isConnecting = false;

export function getKafka(): Kafka | null {
  const env = getEnv();
  if (!env.KAFKA_ENABLED) {
    return null;
  }

  if (!kafkaInstance) {
    kafkaInstance = new Kafka({
      clientId: env.KAFKA_CLIENT_ID,
      brokers: env.KAFKA_BROKERS.split(',').map((b) => b.trim()),
      logLevel: env.LOG_LEVEL === 'debug' ? logLevel.DEBUG : logLevel.WARN,
      retry: {
        initialRetryTime: 100,
        retries: 3,
      },
    });
  }

  return kafkaInstance;
}

export async function getKafkaProducer(): Promise<Producer | null> {
  const kafka = getKafka();
  if (!kafka) return null;

  if (kafkaProducer) return kafkaProducer;

  if (!isConnecting) {
    isConnecting = true;
    try {
      const producer = kafka.producer({
        allowAutoTopicCreation: true,
      });
      await producer.connect();
      kafkaProducer = producer;
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[KAFKA_PRODUCER_CONNECT_WARNING] Could not connect to Kafka broker', err);
      }
      return null;
    } finally {
      isConnecting = false;
    }
  }

  return kafkaProducer;
}

export async function publishEvent(
  topic: KafkaTopic,
  key: string,
  event: TombolaEvent
): Promise<boolean> {
  const env = getEnv();
  if (!env.KAFKA_ENABLED) {
    return false;
  }

  try {
    const producer = await getKafkaProducer();
    if (!producer) {
      // In dev or offline mode, fail soft without blocking critical gameplay
      return false;
    }

    await producer.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(event),
          headers: {
            eventType: event.type,
            traceId: event.traceId,
            timestamp: event.timestamp,
          },
        },
      ],
    });

    return true;
  } catch (err) {
    console.error(`[KAFKA_PUBLISH_ERROR] Failed publishing to ${topic}`, err);
    return false;
  }
}

export function publishEventAsync(topic: KafkaTopic, key: string, event: TombolaEvent): void {
  // Asynchronous non-blocking fire-and-forget dispatch
  void publishEvent(topic, key, event).catch((err) => {
    console.error(`[KAFKA_ASYNC_PUBLISH_ERROR] Failed publishing to ${topic}`, err);
  });
}

export async function checkKafkaHealth(
  timeoutMs = 2000
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const env = getEnv();
  if (!env.KAFKA_ENABLED) {
    return { ok: true, latencyMs: 0, error: 'Kafka disabled by configuration' };
  }

  const kafka = getKafka();
  if (!kafka) {
    return { ok: true, latencyMs: 0, error: 'Kafka client unavailable' };
  }

  const start = performance.now();
  try {
    const admin = kafka.admin();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Kafka health check timed out')), timeoutMs)
    );

    const checkPromise = (async () => {
      await admin.connect();
      const metadata = await admin.describeCluster();
      await admin.disconnect();
      return metadata;
    })();

    await Promise.race([checkPromise, timeoutPromise]);
    const latencyMs = Math.round(performance.now() - start);
    return { ok: true, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : 'Unknown Kafka error';
    return { ok: false, latencyMs, error: message };
  }
}

export async function closeKafkaProducer(): Promise<void> {
  if (kafkaProducer) {
    try {
      await kafkaProducer.disconnect();
    } catch {
      // Ignore disconnect errors
    } finally {
      kafkaProducer = null;
    }
  }
}
