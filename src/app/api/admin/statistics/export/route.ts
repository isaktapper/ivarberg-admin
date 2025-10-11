import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Hämta audit log data
    const { data: auditData, error } = await supabase
      .from('event_audit_log')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Hämta events separat för att få organisatör info
    const eventIds = auditData?.map(log => log.event_id).filter(Boolean) || [];
    const { data: eventsData } = await supabase
      .from('events')
      .select('event_id, organizer_id, venue_name, category, organizers(name)')
      .in('event_id', eventIds);

    // Skapa lookup map
    const eventsMap = new Map(eventsData?.map(e => [e.event_id, e]) || []);

    // Formatera data för Excel
    const excelData = (auditData || []).map(log => {
      const eventInfo = eventsMap.get(log.event_id);
      return {
        'Datum': new Date(log.created_at).toLocaleString('sv-SE'),
        'Event': log.event_name,
        'Åtgärd': log.action === 'auto_published' ? 'Auto-publicerad' :
                  log.action === 'approved' ? 'Godkänd' :
                  log.action === 'rejected' ? 'Nekad' :
                  log.action === 'edited' ? 'Redigerad' :
                  log.action === 'created' ? 'Skapad' : log.action,
        'Gammal status': log.old_status || '-',
        'Ny status': log.new_status || '-',
        'Kvalitetspoäng': log.quality_score || '-',
        'Ändrad av': log.changed_by || 'system',
        'Arrangör': eventInfo?.organizers?.name || 'Okänd',
        'Plats': eventInfo?.venue_name || '-',
        'Kategori': eventInfo?.category || '-',
        'Ändringar': log.changes ? JSON.stringify(log.changes) : '-'
      };
    });

    // Skapa Excel-fil
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Event Statistik');

    // Generera buffer
    const excelBuffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx' 
    });

    // Returnera Excel-fil
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="event-statistik-${new Date().toISOString().split('T')[0]}.xlsx"`
      }
    });

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}

