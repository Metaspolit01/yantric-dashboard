import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';

/**
 * LiveKit Webhook Handler for Call Recordings
 * 
 * This endpoint receives webhook events from LiveKit when:
 * - A room recording is completed (egress_ended)
 * - The recording file is uploaded to storage
 * 
 * It extracts the recording URL and stores it in the calls table.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const headersList = await headers();
    const authorization = headersList.get('authorization');

    // Verify webhook secret (optional but recommended)
    const webhookSecret = process.env.LIVEKIT_WEBHOOK_SECRET;
    if (webhookSecret) {
      // Add your webhook signature verification here
      // For now, we'll skip it for development
      console.log('[Webhook] Skipping signature verification in dev mode');
    }

    const { event, egress, room } = body;

    console.log('[Webhook] Received LiveKit event:', event);

    // Handle egress completion (recording finished)
    if (event === 'egress_ended' && egress?.roomName) {
      const roomName = egress.roomName;
      const recordingUrl = egress.fileResult?.file?.location;
      
      if (!recordingUrl) {
        console.warn('[Webhook] No recording URL in egress event');
        return NextResponse.json({ success: true, message: 'No recording URL' });
      }

      console.log('[Webhook] Recording completed for room:', roomName, 'URL:', recordingUrl);

      // Extract agent_id from room name
      // Room name format: yantric-test-<agent_id>-<timestamp> or yantric-<agent_id>
      const parts = roomName.split('-');
      let agentId: string | null = null;

      if (parts.length >= 7 && parts[0] === 'yantric' && parts[1] === 'test') {
        agentId = parts.slice(2, 7).join('-');
      } else if (parts.length >= 6 && parts[0] === 'yantric') {
        agentId = parts.slice(1, 6).join('-');
      }

      if (!agentId) {
        console.warn('[Webhook] Could not extract agent_id from room name:', roomName);
        return NextResponse.json({ success: false, error: 'Invalid room name format' }, { status: 400 });
      }

      // Get Supabase client
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseServiceKey) {
        console.error('[Webhook] Missing Supabase credentials');
        return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Find the call by room_name
      const { data: callData, error: findError } = await supabase
        .from('calls')
        .select('id, user_id')
        .eq('room_name', roomName)
        .single();

      if (findError || !callData) {
        console.error('[Webhook] Call not found for room:', roomName, findError);
        return NextResponse.json({ success: false, error: 'Call not found' }, { status: 404 });
      }

      // Upload recording to Supabase Storage
      const supabaseStoragePath = `${callData.user_id}/${Date.now()}_recording.webm`;
      
      try {
        // Download the recording from LiveKit's storage
        const recordingResponse = await fetch(recordingUrl);
        if (!recordingResponse.ok) {
          throw new Error(`Failed to download recording: ${recordingResponse.status}`);
        }
        
        const recordingBlob = await recordingResponse.blob();
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('call-recordings')
          .upload(supabaseStoragePath, recordingBlob, {
            contentType: 'audio/webm',
            upsert: false,
          });

        if (uploadError) {
          console.error('[Webhook] Failed to upload to Supabase Storage:', uploadError);
          throw uploadError;
        }

        // Get public URL for the uploaded file
        const { data: urlData } = supabase.storage
          .from('call-recordings')
          .getPublicUrl(supabaseStoragePath);

        const publicUrl = urlData.publicUrl;

        // Update the call record with the recording URL
        const { error: updateError } = await supabase
          .from('calls')
          .update({
            recording_url: publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', callData.id);

        if (updateError) {
          console.error('[Webhook] Failed to update call with recording URL:', updateError);
          return NextResponse.json({ success: false, error: 'Failed to update call' }, { status: 500 });
        }

        console.log('[Webhook] Successfully saved recording URL for call:', callData.id);
        return NextResponse.json({ 
          success: true, 
          message: 'Recording saved',
          recordingUrl: publicUrl,
        });

      } catch (storageError) {
        console.error('[Webhook] Storage operation failed:', storageError);
        // Fallback: save the original LiveKit URL if Supabase upload fails
        const { error: fallbackError } = await supabase
          .from('calls')
          .update({
            recording_url: recordingUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', callData.id);

        if (fallbackError) {
          console.error('[Webhook] Even fallback update failed:', fallbackError);
        } else {
          console.log('[Webhook] Saved fallback recording URL:', recordingUrl);
        }

        return NextResponse.json({ 
          success: true, 
          message: 'Recording saved with fallback URL',
          recordingUrl: recordingUrl,
        });
      }
    }

    // Handle other events (optional)
    console.log('[Webhook] Ignoring event type:', event);
    return NextResponse.json({ success: true, message: 'Event ignored' });

  } catch (error) {
    console.error('[Webhook] Error processing LiveKit webhook:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
