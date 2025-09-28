import { google, gmail_v1 } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { Database } from '@/types/database.types'
import type { SupabaseClient as SupabaseClientType } from '@supabase/supabase-js'

// type Profile = Database['public']['Tables']['profiles']['Row']
// type Email = Database['public']['Tables']['emails']['Row']
type SupabaseClient = SupabaseClientType<Database>

// Define proper types for Gmail API
interface GmailMessage {
  id: string
  threadId: string
  subject: string
  sender: string
  recipient: string
  body: string
  htmlBody: string
  date: string
  labels: string[]
  isRead: boolean
}

// Use official Google API types
type GmailHeader = gmail_v1.Schema$MessagePartHeader
type GmailMessageData = gmail_v1.Schema$Message

export class GmailService {
  private oauth2Client: OAuth2Client
  private gmail: gmail_v1.Gmail

  constructor(accessToken: string, refreshToken: string) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client })
  }

  async getEmails(maxResults: number = 50): Promise<GmailMessage[]> {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults,
      })

      const messages = response.data.messages || []
      const emails = []

      for (const message of messages) {
        if (message.id) {
          const email = await this.getEmailDetails(message.id)
          if (email) {
            emails.push(email)
          }
        }
      }

      return emails
    } catch (error) {
      console.error('Error fetching emails:', error)
      throw error
    }
  }

  private async getEmailDetails(messageId: string): Promise<GmailMessage | null> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      })

      const message: GmailMessageData = response.data
      const headers = message.payload?.headers || []
      
      const getHeader = (name: string) => 
        headers.find((h: GmailHeader) => h.name?.toLowerCase() === name.toLowerCase())?.value

      const subject = getHeader('Subject') || 'No Subject'
      const sender = getHeader('From') || 'Unknown Sender'
      const recipient = getHeader('To') || 'Unknown Recipient'
      const date = getHeader('Date') || new Date().toISOString()

      // Extract body
      let body = ''
      let htmlBody = ''
      
      if (message.payload?.body?.data) {
        body = Buffer.from(message.payload.body.data, 'base64').toString()
      } else if (message.payload?.parts) {
        for (const part of message.payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            body = Buffer.from(part.body.data, 'base64').toString()
          } else if (part.mimeType === 'text/html' && part.body?.data) {
            htmlBody = Buffer.from(part.body.data, 'base64').toString()
          }
        }
      }

      return {
        id: message.id || '',
        threadId: message.threadId || '',
        subject,
        sender,
        recipient,
        body,
        htmlBody,
        date: new Date(date).toISOString(),
        labels: message.labelIds || [],
        isRead: !message.labelIds?.includes('UNREAD')
      }
    } catch (error) {
      console.error('Error fetching email details:', error)
      return null
    }
  }

  async markAsRead(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      })
    } catch (error) {
      console.error('Error marking email as read:', error)
      throw error
    }
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    try {
      const message = [
        `To: ${to}`,
        `Subject: ${subject}`,
        '',
        body
      ].join('\n')

      const encodedMessage = Buffer.from(message).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

      await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      })
    } catch (error) {
      console.error('Error sending email:', error)
      throw error
    }
  }
}

export async function syncEmailsToDatabase(
  supabase: SupabaseClient,
  userId: string,
  emails: GmailMessage[]
): Promise<void> {
  try {
    for (const email of emails) {
      // Check if email already exists
      const { data: existingEmail } = await supabase
        .from('emails')
        .select('id')
        .eq('user_id', userId)
        .eq('message_id', email.id)
        .single()

      if (!existingEmail) {
        // Try to find associated customer by email
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', userId)
          .eq('contact_email', email.sender)
          .single()

        await supabase
          .from('emails')
          .insert({
            user_id: userId,
            client_id: customer?.id || null,
            message_id: email.id,
            thread_id: email.threadId,
            subject: email.subject,
            sender: email.sender,
            recipient: email.recipient,
            body: email.body,
            html_body: email.htmlBody,
            date: email.date,
            is_read: email.isRead,
            labels: email.labels
          })
      }
    }
  } catch (error) {
    console.error('Error syncing emails to database:', error)
    throw error
  }
}
