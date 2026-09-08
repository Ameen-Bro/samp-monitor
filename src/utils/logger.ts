import { blue, green, yellow, red, gray, bold } from 'colorette';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

class Logger {
  private formatTime(): string {
    return new Date().toISOString();
  }

  private sanitize(message: string): string {
    const token = process.env.DISCORD_TOKEN;
    if (token && token.length > 5) {
      return message.replaceAll(token, '[REDACTED_DISCORD_TOKEN]');
    }
    return message;
  }

  debug(context: string, message: string, ...args: any[]): void {
    if (process.env.DEBUG === 'true') {
      const time = gray(this.formatTime());
      const tag = gray('[DEBUG]');
      const ctx = bold(gray(`[${context}]`));
      console.log(`${time} ${tag} ${ctx} ${this.sanitize(message)}`, ...args);
    }
  }

  info(context: string, message: string, ...args: any[]): void {
    const time = gray(this.formatTime());
    const tag = green('[INFO]');
    const ctx = bold(blue(`[${context}]`));
    console.log(`${time} ${tag} ${ctx} ${this.sanitize(message)}`, ...args);
  }

  warn(context: string, message: string, ...args: any[]): void {
    const time = gray(this.formatTime());
    const tag = yellow('[WARN]');
    const ctx = bold(yellow(`[${context}]`));
    console.warn(`${time} ${tag} ${ctx} ${this.sanitize(message)}`, ...args);
  }

  error(context: string, message: string, error?: any): void {
    const time = gray(this.formatTime());
    const tag = red('[ERROR]');
    const ctx = bold(red(`[${context}]`));
    if (error instanceof Error) {
      console.error(`${time} ${tag} ${ctx} ${this.sanitize(message)}: ${error.message}\n${error.stack}`);
    } else if (error) {
      console.error(`${time} ${tag} ${ctx} ${this.sanitize(message)}:`, error);
    } else {
      console.error(`${time} ${tag} ${ctx} ${this.sanitize(message)}`);
    }
  }
}

export const logger = new Logger();
