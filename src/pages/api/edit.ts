import type { APIRoute } from 'astro';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// 仅在 dev 模式下可用
function guard(): Response | null {
  if (!import.meta.env.DEV) return new Response('Not found', { status: 404 });
  return null;
}

function resolvePath(file: string | null): string | null {
  if (!file || file.includes('..') || !file.endsWith('.md')) return null;
  return join(process.cwd(), 'src/content/blog', file);
}

export const GET: APIRoute = ({ url }) => {
  const err = guard();
  if (err) return err;
  const path = resolvePath(url.searchParams.get('file'));
  if (!path) return new Response('Invalid file', { status: 400 });
  try {
    const content = readFileSync(path, 'utf-8');
    return new Response(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  } catch {
    return new Response('File not found', { status: 404 });
  }
};

export const POST: APIRoute = async ({ url, request }) => {
  const err = guard();
  if (err) return err;
  const path = resolvePath(url.searchParams.get('file'));
  if (!path) return new Response('Invalid file', { status: 400 });
  const content = await request.text();
  writeFileSync(path, content, 'utf-8');
  return new Response('OK');
};
