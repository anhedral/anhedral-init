import { stdout } from 'node:process';

const USE_COLOR = Boolean(stdout.isTTY) && process.env.NO_COLOR == null;

function isQuiet(): boolean {
  return process.env.ANHEDRAL_QUIET === '1';
}

function paint(code: string, message: string): string {
  if (!USE_COLOR) return message;
  return `\x1b[${code}m${message}\x1b[0m`;
}

const dim = (value: string): string => paint('2', value);
const bold = (value: string): string => paint('1', value);
const cyan = (value: string): string => paint('36', value);
const green = (value: string): string => paint('32', value);
const red = (value: string): string => paint('31', value);
const magenta = (value: string): string => paint('35', value);

export const anhedralPrint = {
  banner(message: string): void {
    if (isQuiet()) return;
    console.log(`${bold(magenta('>'))} ${bold(message)}\n`);
  },
  section(message: string): void {
    if (isQuiet()) return;
    console.log(`\n${cyan('==')} ${bold(message)}`);
  },
  step(message: string): void {
    if (isQuiet()) return;
    console.log(`  ${cyan('>')} ${message}`);
  },
  done(message: string): void {
    if (isQuiet()) return;
    console.log(`  ${green('ok')} ${message}`);
  },
  info(message: string): void {
    if (isQuiet()) return;
    console.log(`  ${dim(message)}`);
  },
  fail(message: string): void {
    if (isQuiet()) return;
    console.log(`  ${red('x')} ${message}`);
  },
};
