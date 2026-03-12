import { createClient, RedisClientType } from 'redis';

export class RedisClient {
  private client: RedisClientType | null = null;
  private isConnected: boolean = false;

  constructor() {
    this.connect();
  }

  private async connect() {
    try {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('Redis重连次数超过限制');
              return new Error('重连失败');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.client.on('error', (err) => console.error('Redis错误:', err));
      this.client.on('connect', () => {
        console.log('Redis连接成功');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.error('Redis连接失败:', error);
      this.isConnected = false;
    }
  }

  /**
   * 设置键值
   */
  async set(key: string, value: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    await this.client.set(key, value);
  }

  /**
   * 设置键值并指定过期时间（秒）
   */
  async setex(key: string, seconds: number, value: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    await this.client.setEx(key, seconds, value);
  }

  /**
   * 获取值
   */
  async get(key: string): Promise<string | null> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    return await this.client.get(key);
  }

  /**
   * 删除键
   */
  async del(key: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    return await this.client.del(key);
  }

  /**
   * 批量获取
   */
  async mget(keys: string[]): Promise<(string | null)[]> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    return await this.client.mGet(keys);
  }

  /**
   * 检查键是否存在
   */
  async exists(key: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    return await this.client.exists(key);
  }

  /**
   * 设置过期时间
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    return await this.client.expire(key, seconds);
  }

  /**
   * 获取过期时间
   */
  async ttl(key: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    return await this.client.ttl(key);
  }

  /**
   * 哈希表操作 - HSET
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    return await this.client.hSet(key, field, value);
  }

  /**
   * 哈希表操作 - HGET
   */
  async hget(key: string, field: string): Promise<string | undefined> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    return await this.client.hGet(key, field);
  }

  /**
   * 哈希表操作 - HGETALL
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    return await this.client.hGetAll(key);
  }

  /**
   * 列表操作 - LPUSH
   */
  async lpush(key: string, ...values: string[]): Promise<number> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    return await this.client.lPush(key, values);
  }

  /**
   * 列表操作 - LRANGE
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    return await this.client.lRange(key, start, stop);
  }

  /**
   * 有序集合操作 - ZADD
   */
  async zadd(key: string, score: number, member: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    return await this.client.zAdd(key, { score, value: member });
  }

  /**
   * 有序集合操作 - ZRANGE
   */
  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis未连接');
    }

    return await this.client.zRange(key, start, stop);
  }

  /**
   * 关闭连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      console.log('Redis连接已关闭');
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

const redis = new RedisClient();
export default redis;
