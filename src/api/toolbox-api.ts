import { EventEmitter } from 'events';
import { Notification } from 'electron';
import { ToolBoxEvent, ToolBoxEventPayload, NotificationOptions } from '../types';

/**
 * ToolBox API that provides events and functionality to tools
 */
export class ToolBoxAPI extends EventEmitter {
  private eventHistory: ToolBoxEventPayload[] = [];

  constructor() {
    super();
  }

  /**
   * Show a notification to the user
   */
  showNotification(options: NotificationOptions): void {
    const notification = new Notification({
      title: options.title,
      body: options.body,
      urgency: options.type === 'error' ? 'critical' : 'normal',
    });

    notification.show();

    this.emitEvent(ToolBoxEvent.NOTIFICATION_SHOWN, options);
  }

  /**
   * Emit a ToolBox event
   */
  emitEvent(event: ToolBoxEvent, data: unknown): void {
    const payload: ToolBoxEventPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    this.eventHistory.push(payload);
    this.emit(event, payload);
  }

  /**
   * Get event history
   */
  getEventHistory(limit?: number): ToolBoxEventPayload[] {
    if (limit) {
      return this.eventHistory.slice(-limit);
    }
    return [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  clearEventHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Subscribe to a specific event
   */
  subscribe(event: ToolBoxEvent, callback: (payload: ToolBoxEventPayload) => void): void {
    this.on(event, callback);
  }

  /**
   * Unsubscribe from a specific event
   */
  unsubscribe(event: ToolBoxEvent, callback: (payload: ToolBoxEventPayload) => void): void {
    this.off(event, callback);
  }
}
