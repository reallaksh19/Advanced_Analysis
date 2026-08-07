import { assertEventPayload } from './event-topics.js';

/**
 * Synchronous application event bus.
 *
 * Storage contract: Map<string, Set<Function>>.
 * Publishing uses a listener snapshot so subscriptions may safely detach while
 * an event is being dispatched. Listener failures are reported only after every
 * callback has received the event. Every propagated failure retains the topic
 * that owned the failing listener so nested publication failures remain
 * diagnosable instead of being misclassified by their caller.
 */
class EventBusContract {
  #topics = new Map();

  subscribe(topic, callback) {
    assertTopic(topic);
    if (typeof callback !== 'function') {
      throw new TypeError('EventBus.subscribe callback must be a function.');
    }

    const listeners = this.#topics.get(topic) ?? new Set();
    listeners.add(callback);
    this.#topics.set(topic, listeners);

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;

      listeners.delete(callback);
      if (listeners.size === 0) {
        this.#topics.delete(topic);
      }
    };
  }

  publish(topic, payload) {
    assertTopic(topic);
    assertEventPayload(topic, payload);

    const listeners = this.#topics.get(topic);
    if (!listeners) return;

    const failures = [];
    [...listeners].forEach((callback) => {
      try {
        callback(payload);
      } catch (error) {
        failures.push(error);
      }
    });

    if (failures.length === 1) {
      throw contextualizeFailure(topic, failures[0]);
    }
    if (failures.length > 1) {
      const details = failures.map((error, index) => {
        const code = typeof error?.code === 'string' && error.code ? ` [${error.code}]` : '';
        const message = error instanceof Error ? error.message : String(error);
        return `${index + 1}${code}: ${message}`;
      }).join(' | ');
      throw new AggregateError(
        failures,
        `EventBus listeners failed for topic: ${topic}. ${details}`,
      );
    }
  }

  listenerCount(topic) {
    assertTopic(topic);
    return this.#topics.get(topic)?.size ?? 0;
  }
}

function contextualizeFailure(topic, failure) {
  const message = failure instanceof Error ? failure.message : String(failure);
  const wrapped = new Error(`EventBus listener failed for topic: ${topic}. ${message}`, {
    cause: failure instanceof Error ? failure : undefined,
  });
  wrapped.code = typeof failure?.code === 'string' && failure.code
    ? failure.code
    : 'EVENT_BUS_LISTENER_FAILED';
  return wrapped;
}

function assertTopic(topic) {
  if (typeof topic !== 'string' || topic.trim() === '') {
    throw new TypeError('EventBus topic must be a non-empty string.');
  }
}

export const EventBus = Object.freeze(new EventBusContract());
