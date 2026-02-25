import { spawn } from 'node:child_process';
import { NOTES_JXA_SCRIPT } from './notes-jxa.js';

interface JxaEnvelope {
  ok: boolean;
  result?: unknown;
  error?: string;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '').trim();
}

export class AppleNotesBridge {
  async execute<T>(operation: string, payload: Record<string, unknown>): Promise<T> {
    const { stdout, stderr, exitCode } = await this.runJxa(operation, payload);

    const output = stripAnsi(stdout);
    const errorOutput = stripAnsi(stderr);

    if (exitCode !== 0) {
      throw new Error(errorOutput || output || `osascript exited with code ${exitCode}`);
    }

    if (!output) {
      throw new Error(errorOutput || 'No output returned from Apple Notes automation.');
    }

    let envelope: JxaEnvelope;
    try {
      envelope = JSON.parse(output) as JxaEnvelope;
    } catch {
      throw new Error(`Failed to parse Apple Notes output: ${output}`);
    }

    if (!envelope.ok) {
      throw new Error(envelope.error || 'Unknown Apple Notes automation error.');
    }

    return envelope.result as T;
  }

  private runJxa(
    operation: string,
    payload: Record<string, unknown>,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
      const child = spawn('osascript', ['-l', 'JavaScript'], {
        env: {
          ...process.env,
          MCP_NOTES_OPERATION: operation,
          MCP_NOTES_PAYLOAD: JSON.stringify(payload ?? {}),
        },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code });
      });

      child.stdin.write(NOTES_JXA_SCRIPT);
      child.stdin.end();
    });
  }
}
