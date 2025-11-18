'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

interface EmailRecipient {
  id: number;
  email: string;
  name?: string;
  notification_types: string[];
  enabled: boolean;
  created_at: string;
}

export default function NotificationsPage() {
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    loadRecipients();
  }, []);

  async function loadRecipients() {
    setLoading(true);
    setError(null);
    
    const { data, error: fetchError } = await supabase
      .from('email_recipients')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (fetchError) {
      setError('Kunde inte ladda mottagare: ' + fetchError.message);
    } else if (data) {
      setRecipients(data);
    }
    
    setLoading(false);
  }

  async function addRecipient() {
    if (!newEmail) {
      setError('Email-adress krävs');
      return;
    }

    // Validera email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setError('Ogiltig email-adress');
      return;
    }

    setError(null);
    
    const { error: insertError } = await supabase
      .from('email_recipients')
      .insert({
        email: newEmail,
        name: newName || null,
        notification_types: ['daily_report'],
        enabled: true
      });

    if (insertError) {
      if (insertError.code === '23505') { // Unique constraint violation
        setError('Denna email-adress finns redan');
      } else {
        setError('Kunde inte lägga till mottagare: ' + insertError.message);
      }
    } else {
      setNewEmail('');
      setNewName('');
      loadRecipients();
    }
  }

  async function toggleEnabled(id: number, currentEnabled: boolean) {
    const { error: updateError } = await supabase
      .from('email_recipients')
      .update({ enabled: !currentEnabled })
      .eq('id', id);
    
    if (updateError) {
      setError('Kunde inte uppdatera: ' + updateError.message);
    } else {
      loadRecipients();
    }
  }

  async function deleteRecipient(id: number, email: string) {
    if (!confirm(`Är du säker på att du vill ta bort ${email}?`)) return;
    
    const { error: deleteError } = await supabase
      .from('email_recipients')
      .delete()
      .eq('id', id);
    
    if (deleteError) {
      setError('Kunde inte ta bort: ' + deleteError.message);
    } else {
      loadRecipients();
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center">Laddar...</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">📧 Email-notifikationer</h1>
        <p className="text-gray-600">
          Hantera vilka som ska få dagliga rapporter från event-scrapern
        </p>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Add new recipient */}
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
        <h2 className="text-xl font-semibold mb-4">Lägg till mottagare</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            placeholder="email@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Namn (valfritt)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
            className="sm:w-48 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button
            onClick={addRecipient}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Lägg till
          </Button>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          💡 Mottagare får automatiskt dagliga email-rapporter efter varje scraping
        </p>
      </div>

      {/* Recipients list */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h2 className="text-xl font-semibold">
            Mottagare ({recipients.length})
          </h2>
        </div>
        
        {recipients.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Inga mottagare ännu. Lägg till en email-adress ovan för att börja få rapporter.
          </div>
        ) : (
          <div className="divide-y">
            {recipients.map(recipient => (
              <div key={recipient.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{recipient.email}</div>
                  {recipient.name && (
                    <div className="text-sm text-gray-500">{recipient.name}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    Tillagd {new Date(recipient.created_at).toLocaleDateString('sv-SE')}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleEnabled(recipient.id, recipient.enabled)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      recipient.enabled 
                        ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {recipient.enabled ? '✓ Aktiv' : 'Inaktiv'}
                  </button>
                  <button
                    onClick={() => deleteRecipient(recipient.id, recipient.email)}
                    className="px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 font-medium transition-colors"
                  >
                    Ta bort
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">ℹ️ Om email-rapporter</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Emails skickas automatiskt efter varje daglig scraping (kl. 06:00)</li>
          <li>• Rapporten innehåller sammanfattning och status för alla scrapers</li>
          <li>• Du kan när som helst aktivera/inaktivera mottagare utan att ta bort dem</li>
          <li>• Använd <code className="bg-blue-100 px-1 rounded">onboarding@resend.dev</code> som avsändare tills du verifierar din egen domän</li>
        </ul>
      </div>
    </div>
  );
}

