import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';

/**
 * Outbound Campaigns API
 *
 * GET  /api/campaigns — list campaigns with live progress counts
 * POST /api/campaigns — create a campaign from an uploaded .xlsx/.csv sheet
 *
 * The uploaded sheet is parsed server-side; we store only the phone/name
 * columns needed for dialing, never the whole file.
 */

const MAX_CONTACTS = 500;

/** Normalizes Indian/international numbers to E.164-ish "+<digits>". */
export function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Excel often stores numbers as floats (919876543210.0)
  s = s.replace(/\.0+$/, '');
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

type Row = Record<string, unknown>;

function pickPhoneColumn(rows: string[][]): number {
  if (rows.length === 0) return -1;
  const header = rows[0].map((c) => String(c ?? '').toLowerCase());
  const keywords = ['phone', 'mobile', 'number', 'contact', 'whatsapp', 'msisdn'];
  for (let i = 0; i < header.length; i++) {
    if (keywords.some((k) => header[i].includes(k))) return i;
  }
  return 0; // fall back to first column
}

function pickNameColumn(rows: string[][], excludeIdx: number): number {
  if (rows.length === 0) return -1;
  const header = rows[0].map((c) => String(c ?? '').toLowerCase());
  for (let i = 0; i < header.length; i++) {
    if (i !== excludeIdx && (header[i].includes('name') || header[i].includes('customer'))) return i;
  }
  return -1;
}

async function parseSheet(file: File): Promise<string[][]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv')) {
    const text = await file.text();
    const delim = (text.split('\n')[0]?.match(/[;\t]/) || [','])[0];
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((line) => line.split(delim).map((c) => c.trim().replace(/^"|"$/g, '')));
  }

  // .xlsx / .xls
  const XLSX = await import('xlsx');
  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as string[][];
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data: campaigns, error } = await supabase
    .from('outbound_campaigns')
    .select('*, agents(name)')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Progress counts grouped by campaign + status
  const ids = (campaigns ?? []).map((c) => c.id);
  let counts: { campaign_id: string; status: string; count: number }[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from('campaign_contacts')
      .select('campaign_id, status')
      .in('campaign_id', ids);
    const tally = new Map<string, number>();
    for (const row of data ?? []) {
      const key = `${row.campaign_id}|${row.status}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    counts = [...tally.entries()].map(([key, count]) => {
      const [campaign_id, status] = key.split('|');
      return { campaign_id, status, count };
    });
  }

  return NextResponse.json({ campaigns, counts });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Send the sheet as multipart form data.' }, { status: 400 });
  }

  const agentId = String(form.get('agentId') || '');
  const name = String(form.get('name') || '').trim() || 'Untitled campaign';
  const fromNumberRaw = String(form.get('fromNumber') || '').trim();
  const fromNumber = fromNumberRaw ? normalizePhone(fromNumberRaw) : null;
  const file = form.get('file');

  if (!agentId) return NextResponse.json({ error: 'Select an agent.' }, { status: 400 });
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Upload an .xlsx or .csv file.' }, { status: 400 });
  }
  if (file.size === 0 || file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Files must be between 1 byte and 5 MB.' }, { status: 400 });
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id, status')
    .eq('id', agentId)
    .eq('user_id', session.userId)
    .neq('status', 'deleted')
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });

  let rows: string[][];
  try {
    rows = await parseSheet(file);
  } catch {
    return NextResponse.json(
      { error: 'Could not read that file. Save it as .xlsx or .csv and try again.' },
      { status: 422 },
    );
  }

  const phoneCol = pickPhoneColumn(rows);
  const nameCol = pickNameColumn(rows, phoneCol);

  // Skip the header row when the phone column came from a keyword match.
  const hasHeader =
    rows.length > 0 &&
    Number.isNaN(Number(String(rows[0][phoneCol] ?? '').replace(/[+\s-]/g, '')));
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const seen = new Set<string>();
  const contacts: { phone: string; name: string | null }[] = [];
  let invalid = 0;

  for (const row of dataRows) {
    const phone = normalizePhone(row[phoneCol]);
    if (!phone) {
      if (row.some((c) => String(c ?? '').trim())) invalid++;
      continue;
    }
    if (seen.has(phone)) continue;
    seen.add(phone);
    const contactName =
      nameCol >= 0 ? String(row[nameCol] ?? '').trim().slice(0, 120) || null : null;
    contacts.push({ phone, name: contactName });
    if (contacts.length >= MAX_CONTACTS) break;
  }

  if (contacts.length === 0) {
    return NextResponse.json(
      { error: 'No valid phone numbers found. Include a column with phone/mobile numbers.' },
      { status: 422 },
    );
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('outbound_campaigns')
    .insert({
      user_id: session.userId,
      agent_id: agentId,
      name: name.slice(0, 160),
      from_number: fromNumber,
      status: 'draft',
      total_contacts: contacts.length,
    })
    .select()
    .single();
  if (campaignError || !campaign) {
    return NextResponse.json({ error: campaignError?.message ?? 'Insert failed.' }, { status: 500 });
  }

  const { error: contactsError } = await supabase.from('campaign_contacts').insert(
    contacts.map((c) => ({
      campaign_id: campaign.id,
      user_id: session.userId,
      agent_id: agentId,
      phone: c.phone,
      name: c.name,
    })),
  );
  if (contactsError) {
    await supabase.from('outbound_campaigns').delete().eq('id', campaign.id);
    return NextResponse.json({ error: contactsError.message }, { status: 500 });
  }

  return NextResponse.json(
    { campaign, imported: contacts.length, skippedInvalid: invalid },
    { status: 201 },
  );
}
