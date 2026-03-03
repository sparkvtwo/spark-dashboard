import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const filePath = path.join(process.cwd(), '..', '.openclaw', 'workspace', 'licenses', 'licenses.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Could not load license data' }, { status: 500 });
  }
}
