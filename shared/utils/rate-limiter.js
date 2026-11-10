export class RateLimiter {
  constructor(minDelay = 500) {
    this.minDelay = minDelay;
    this.lastRequest = 0;
    this.queue = [];
    this.processing = false;
  }

  async schedule(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      if (!this.processing) this._process();
    });
  }

  async _process() {
    this.processing = true;
    while (this.queue.length > 0) {
      const now = Date.now();
      const wait = this.minDelay - (now - this.lastRequest);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      const { fn, resolve, reject } = this.queue.shift();
      this.lastRequest = Date.now();
      try {
        resolve(await fn());
      } catch (err) {
        reject(err);
      }
    }
    this.processing = false;
  }
}
