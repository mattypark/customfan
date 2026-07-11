/** Fixed-capacity ring buffer. Oldest entries drop off as new ones arrive. */
export class RingBuffer<T> {
  private items: T[] = [];

  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new Error('RingBuffer capacity must be >= 1');
  }

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.shift();
  }

  /** Snapshot copy, oldest → newest. */
  toArray(): T[] {
    return [...this.items];
  }

  get size(): number {
    return this.items.length;
  }

  get latest(): T | undefined {
    return this.items[this.items.length - 1];
  }
}
