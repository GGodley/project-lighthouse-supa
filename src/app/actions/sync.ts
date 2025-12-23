'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { encryptToken } from '@/utils/crypto';
import { cookies } from 'next/headers';

/**
 * Trigger.dev API response handle type
 */
interface TriggerDevHandle {
  id?: string | number;
  [key: string]: unknown;
}

/**
 * Server Action to start Gmail sync via Trigger.dev
 * 
 * This action triggers the 'ingest-threads' Trigger.dev job which orchestrates
 * fetching Gmail threads from the Supabase Edge Function with pagination.
 * 
 * Uses Cookie Backpack pattern - reads access token from secure HTTP-only cookie.
 * Trigger.dev handles queue management, so no database tracking needed.
 * 
 * @returns Object with success status and optional error message
 * @throws Error("Unauthorized") if user not authenticated
 * @throws Error if trigger fails
 */
export async function startGmailSync(): Promise<{ success: boolean; handle?: TriggerDevHandle; error?: string; redirectToLogin?: boolean }> {
  // Initialize Supabase client using modern SSR pattern
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error } = await supabase.auth.getUser();

  // Check authentication
  if (error || !user) {
    throw new Error('Unauthorized');
  }

  // Retrieve access token from secure cookie (Cookie Backpack pattern)
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  let accessToken = cookieStore.get('google_access_token')?.value;
  
  console.log('🔍 [STAGE 1] Initial Cookie Check:', {
    hasGoogleTokenCookie: !!accessToken,
    cookieLength: accessToken?.length,
    cookiePrefix: accessToken ? `${accessToken.substring(0, 10)}...` : 'N/A',
    userId: user.id,
    allCookieNames: allCookies.map(c => c.name),
    totalCookies: allCookies.length,
    nodeEnv: process.env.NODE_ENV,
  });

  // Fallback: If cookie is missing, try to get token from session or refresh from Google
  if (!accessToken) {
    console.log('⚠️ [STAGE 2] Cookie missing, checking session...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/actions/sync.ts:57',message:'Cookie missing - checking session structure',data:{hasSession:!!session,sessionError:sessionError?.message,sessionKeys:session?Object.keys(session):[],hasProviderToken:!!session?.provider_token,hasProviderRefreshToken:!!session?.provider_refresh_token,hasAccessToken:!!session?.access_token,hasRefreshToken:!!session?.refresh_token,userId:user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    console.log('🔍 [STAGE 2] Session Check Results:', {
      hasSession: !!session,
      sessionError: sessionError?.message || null,
      hasProviderToken: !!session?.provider_token,
      providerTokenLength: session?.provider_token?.length || 0,
      providerTokenPrefix: session?.provider_token ? `${session.provider_token.substring(0, 10)}...` : 'N/A',
      hasProviderRefreshToken: !!session?.provider_refresh_token,
      providerRefreshTokenLength: session?.provider_refresh_token?.length || 0,
      hasAccessToken: !!session?.access_token,
      hasRefreshToken: !!session?.refresh_token,
      sessionKeys: session ? Object.keys(session) : [],
      userId: user.id,
    });
    
    if (session?.provider_token) {
      console.log('✅ [STAGE 3] Found provider_token in session, setting cookie...');
      accessToken = session.provider_token;
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/actions/sync.ts:75',message:'Found provider_token in session - setting cookie',data:{providerTokenLength:accessToken.length,providerTokenPrefix:accessToken.substring(0,10)},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      try {
        // Set the cookie for future requests
        cookieStore.set('google_access_token', accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 3600, // 1 hour
          path: '/',
        });
        
        // Verify cookie was set
        const verifyCookie = cookieStore.get('google_access_token');
        console.log('🍪 [STAGE 3] Cookie Set Successfully:', {
          cookieSet: !!verifyCookie,
          cookieValueLength: verifyCookie?.value?.length || 0,
          cookieOptions: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 3600,
            path: '/',
          },
        });
      } catch (cookieError) {
        console.error('❌ [STAGE 3] Failed to set cookie:', cookieError);
      }
    } else if (session?.provider_refresh_token) {
      // Try to refresh the access token using the refresh token
      console.log('🔄 [STAGE 4] Have refresh token in session, fetching new access token from Google...');
      console.log('🔍 [STAGE 4] Refresh Token Details:', {
        hasRefreshToken: !!session.provider_refresh_token,
        refreshTokenLength: session.provider_refresh_token.length,
        refreshTokenPrefix: `${session.provider_refresh_token.substring(0, 10)}...`,
      });
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/actions/sync.ts:95',message:'Attempting to refresh access token from Google using session refresh token',data:{hasRefreshToken:!!session.provider_refresh_token,refreshTokenLength:session.provider_refresh_token.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      try {
        const googleClientId = process.env.GOOGLE_CLIENT_ID;
        const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
        
        console.log('🔍 [STAGE 4] Google OAuth Credentials Check:', {
          hasClientId: !!googleClientId,
          hasClientSecret: !!googleClientSecret,
          clientIdLength: googleClientId?.length || 0,
          clientSecretLength: googleClientSecret?.length || 0,
        });
        
        if (googleClientId && googleClientSecret) {
          console.log('📡 [STAGE 4] Sending token refresh request to Google...');
          const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: googleClientId,
              client_secret: googleClientSecret,
              refresh_token: session.provider_refresh_token,
              grant_type: 'refresh_token',
            }),
          });
          
          console.log('📡 [STAGE 4] Google Token Refresh Response:', {
            status: tokenResponse.status,
            statusText: tokenResponse.statusText,
            ok: tokenResponse.ok,
            headers: Object.fromEntries(tokenResponse.headers.entries()),
          });
          
          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json();
            const refreshedToken = tokenData.access_token;
            
            console.log('🔍 [STAGE 4] Token Refresh Response Data:', {
              hasAccessToken: !!refreshedToken,
              accessTokenLength: refreshedToken?.length || 0,
              hasRefreshToken: !!tokenData.refresh_token,
              expiresIn: tokenData.expires_in,
              tokenType: tokenData.token_type,
              responseKeys: Object.keys(tokenData),
            });
            
            if (refreshedToken) {
              accessToken = refreshedToken;
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/actions/sync.ts:130',message:'Successfully refreshed access token from Google using session refresh token',data:{hasAccessToken:!!refreshedToken,accessTokenLength:refreshedToken.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              
              try {
                // Set the cookie for future requests
                cookieStore.set('google_access_token', refreshedToken, {
                  httpOnly: true,
                  secure: process.env.NODE_ENV === 'production',
                  sameSite: 'lax',
                  maxAge: 3600, // 1 hour
                  path: '/',
                });
                
                const verifyCookie = cookieStore.get('google_access_token');
                console.log('🍪 [STAGE 4] Cookie Set from Refreshed Token:', {
                  cookieSet: !!verifyCookie,
                  cookieValueLength: verifyCookie?.value?.length || 0,
                });
              } catch (cookieError) {
                console.error('❌ [STAGE 4] Failed to set cookie after refresh:', cookieError);
              }
            } else {
              console.error('❌ [STAGE 4] Token refresh response missing access_token. Full response:', JSON.stringify(tokenData, null, 2));
            }
          } else {
            const errorText = await tokenResponse.text();
            console.error('❌ [STAGE 4] Failed to refresh token from Google:', {
              status: tokenResponse.status,
              statusText: tokenResponse.statusText,
              errorText: errorText,
              errorTextLength: errorText.length,
            });
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/actions/sync.ts:150',message:'Failed to refresh token from Google',data:{status:tokenResponse.status,statusText:tokenResponse.statusText,errorText:errorText.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
          }
        } else {
          console.error('❌ [STAGE 4] Missing Google OAuth credentials:', {
            hasClientId: !!googleClientId,
            hasClientSecret: !!googleClientSecret,
          });
        }
      } catch (error) {
        console.error('❌ [STAGE 4] Error refreshing token:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    } else {
      console.log('⚠️ [STAGE 4] No provider_token or provider_refresh_token in session');
    }
    
    // If still no access token, try to get refresh token from auth.identities using service role
    if (!accessToken) {
      console.log('🔄 [STAGE 5] No token in session, attempting to get refresh token from auth.identities...');
      
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        console.log('🔍 [STAGE 5] Environment Variables Check:', {
          hasSupabaseUrl: !!supabaseUrl,
          supabaseUrl: supabaseUrl || 'MISSING',
          hasServiceKey: !!supabaseServiceKey,
          serviceKeyLength: supabaseServiceKey?.length || 0,
          serviceKeyPrefix: supabaseServiceKey ? `${supabaseServiceKey.substring(0, 10)}...` : 'MISSING',
        });
        
        if (supabaseUrl && supabaseServiceKey) {
          console.log('🔧 [STAGE 5] Creating Supabase admin client...');
          const supabaseAdmin = createSupabaseAdminClient(
            supabaseUrl,
            supabaseServiceKey,
            { auth: { autoRefreshToken: false, persistSession: false } }
          );
          
          console.log('📡 [STAGE 5] Fetching user from admin API...', {
            userId: user.id,
          });
          
          // Get user's identities to find Google refresh token
          const { data: { user: adminUser }, error: adminError } = await supabaseAdmin.auth.admin.getUserById(user.id);
          
          console.log('📡 [STAGE 5] Admin API Response:', {
            hasAdminUser: !!adminUser,
            adminError: adminError?.message || null,
            adminErrorCode: adminError?.status || null,
            userId: adminUser?.id || null,
            identitiesCount: adminUser?.identities?.length || 0,
          });
          
          if (!adminError && adminUser) {
            console.log('🔍 [STAGE 5] User Identities:', {
              identities: adminUser.identities?.map((id: { provider: string; id: string }) => ({
                provider: id.provider,
                id: id.id,
              })) || [],
              allIdentityKeys: adminUser.identities?.map((id: any) => Object.keys(id)) || [],
            });
            
            // Find Google identity
            const googleIdentity = adminUser.identities?.find(
              (identity: { provider: string }) => identity.provider === 'google'
            );
            
            console.log('🔍 [STAGE 5] Google Identity Found:', {
              hasGoogleIdentity: !!googleIdentity,
              identityKeys: googleIdentity ? Object.keys(googleIdentity) : [],
              hasIdentityData: !!googleIdentity?.identity_data,
              identityDataKeys: googleIdentity?.identity_data ? Object.keys(googleIdentity.identity_data) : [],
            });
            
            if (googleIdentity?.identity_data) {
              console.log('🔍 [STAGE 5] Identity Data Structure:', {
                identityData: JSON.stringify(googleIdentity.identity_data, null, 2).substring(0, 500),
              });
            }
            
            if (googleIdentity?.identity_data?.provider_refresh_token) {
              const refreshToken = googleIdentity.identity_data.provider_refresh_token as string;
              
              console.log('✅ [STAGE 5] Found refresh token in auth.identities:', {
                hasRefreshToken: !!refreshToken,
                refreshTokenLength: refreshToken.length,
                refreshTokenPrefix: `${refreshToken.substring(0, 10)}...`,
              });
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/actions/sync.ts:240',message:'Found refresh token in auth.identities, refreshing from Google',data:{hasRefreshToken:!!refreshToken,refreshTokenLength:refreshToken.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'E'})}).catch(()=>{});
              // #endregion
              
              // Refresh access token from Google
              const googleClientId = process.env.GOOGLE_CLIENT_ID;
              const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
              
              console.log('🔍 [STAGE 5] Google OAuth Credentials Check:', {
                hasClientId: !!googleClientId,
                hasClientSecret: !!googleClientSecret,
              });
              
              if (googleClientId && googleClientSecret) {
                console.log('📡 [STAGE 5] Sending token refresh request to Google...');
                const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams({
                    client_id: googleClientId,
                    client_secret: googleClientSecret,
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token',
                  }),
                });
                
                console.log('📡 [STAGE 5] Google Token Refresh Response:', {
                  status: tokenResponse.status,
                  statusText: tokenResponse.statusText,
                  ok: tokenResponse.ok,
                });
                
                if (tokenResponse.ok) {
                  const tokenData = await tokenResponse.json();
                  const refreshedToken = tokenData.access_token;
                  
                  console.log('🔍 [STAGE 5] Token Refresh Response Data:', {
                    hasAccessToken: !!refreshedToken,
                    accessTokenLength: refreshedToken?.length || 0,
                    responseKeys: Object.keys(tokenData),
                  });
                  
                  if (refreshedToken) {
                    accessToken = refreshedToken;
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/actions/sync.ts:280',message:'Successfully refreshed access token from auth.identities',data:{hasAccessToken:!!refreshedToken,accessTokenLength:refreshedToken.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'E'})}).catch(()=>{});
                    // #endregion
                    
                    try {
                      // Set the cookie for future requests
                      cookieStore.set('google_access_token', refreshedToken, {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'lax',
                        maxAge: 3600, // 1 hour
                        path: '/',
                      });
                      
                      const verifyCookie = cookieStore.get('google_access_token');
                      console.log('🍪 [STAGE 5] Cookie Set from auth.identities Refresh:', {
                        cookieSet: !!verifyCookie,
                        cookieValueLength: verifyCookie?.value?.length || 0,
                      });
                    } catch (cookieError) {
                      console.error('❌ [STAGE 5] Failed to set cookie after auth.identities refresh:', cookieError);
                    }
                  } else {
                    console.error('❌ [STAGE 5] Token refresh response missing access_token. Full response:', JSON.stringify(tokenData, null, 2));
                  }
                } else {
                  const errorText = await tokenResponse.text();
                  console.error('❌ [STAGE 5] Failed to refresh token from Google:', {
                    status: tokenResponse.status,
                    statusText: tokenResponse.statusText,
                    errorText: errorText,
                  });
                }
              } else {
                console.error('❌ [STAGE 5] Missing Google OAuth credentials');
              }
            } else {
              console.warn('⚠️ [STAGE 5] No Google refresh token found in auth.identities:', {
                hasGoogleIdentity: !!googleIdentity,
                hasIdentityData: !!googleIdentity?.identity_data,
                identityDataKeys: googleIdentity?.identity_data ? Object.keys(googleIdentity.identity_data) : [],
              });
            }
          } else {
            console.error('❌ [STAGE 5] Failed to get user from admin API:', {
              error: adminError?.message || 'Unknown error',
              errorCode: adminError?.status || null,
              errorName: adminError?.name || null,
            });
          }
        } else {
          console.error('❌ [STAGE 5] Missing Supabase environment variables');
        }
      } catch (error) {
        console.error('❌ [STAGE 5] Error getting refresh token from auth.identities:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
    
    if (!accessToken) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c491ee85-efeb-4d2c-9d52-24ddd844a378',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/actions/sync.ts:350',message:'No access token found after all attempts',data:{allCookies:cookieStore.getAll().map(c=>c.name),sessionExists:!!session,sessionUser:session?.user?.id,hasProviderToken:!!session?.provider_token,hasProviderRefreshToken:!!session?.provider_refresh_token},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      console.error('❌ [FINAL] No access token found after all attempts:', {
        allCookies: cookieStore.getAll().map(c => c.name),
        sessionExists: !!session,
        sessionUser: session?.user?.id,
        hasProviderToken: !!session?.provider_token,
        hasProviderRefreshToken: !!session?.provider_refresh_token,
        userId: user.id,
      });
      // Return error that indicates redirect is needed
      return { success: false, error: 'Session expired. Please log in again.', redirectToLogin: true };
    }
  }

  console.log('✅ [STAGE 6] Access token obtained, proceeding to encryption:', {
    hasAccessToken: !!accessToken,
    accessTokenLength: accessToken.length,
    accessTokenPrefix: `${accessToken.substring(0, 10)}...`,
  });

  // Encrypt the access token
  let encryptedToken: string;
  try {
    console.log('🔐 [STAGE 6] Encrypting access token...');
    encryptedToken = await encryptToken(accessToken);
    console.log('✅ [STAGE 6] Token encrypted successfully:', {
      encryptedTokenLength: encryptedToken.length,
      encryptedTokenPrefix: `${encryptedToken.substring(0, 20)}...`,
    });
  } catch (encryptError) {
    console.error('❌ [STAGE 6] Failed to encrypt token:', {
      error: encryptError instanceof Error ? encryptError.message : String(encryptError),
      stack: encryptError instanceof Error ? encryptError.stack : undefined,
    });
    throw new Error(`Failed to encrypt access token: ${encryptError instanceof Error ? encryptError.message : String(encryptError)}`);
  }

  // Get Trigger.dev API key from environment
  console.log('🔍 [STAGE 7] Checking Trigger.dev configuration...');
  const triggerApiKey = process.env.TRIGGER_API_KEY;
  if (!triggerApiKey) {
    console.error('❌ [STAGE 7] TRIGGER_API_KEY environment variable is not set');
    throw new Error('TRIGGER_API_KEY environment variable is not set');
  }
  
  console.log('✅ [STAGE 7] Trigger.dev API key found:', {
    hasApiKey: !!triggerApiKey,
    apiKeyLength: triggerApiKey.length,
    apiKeyPrefix: `${triggerApiKey.substring(0, 10)}...`,
  });

  // Trigger Trigger.dev job via HTTP API (works in Server Actions)
  const triggerUrl = 'https://api.trigger.dev/api/v1/tasks/ingest-threads/trigger';
  const triggerPayload = {
    payload: {
      userId: user.id,
      encryptedAccessToken: encryptedToken,
    },
    concurrencyKey: user.id,
  };

  console.log('📡 [STAGE 7] Sending request to Trigger.dev:', {
    url: triggerUrl,
    userId: user.id,
    payloadKeys: Object.keys(triggerPayload),
    encryptedTokenLength: encryptedToken.length,
  });

  try {
    const response = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${triggerApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(triggerPayload),
    });

    console.log('📡 [STAGE 7] Trigger.dev Response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [STAGE 7] Trigger.dev API Error:', {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText,
      });
      throw new Error(`Failed to trigger job: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ [STAGE 7] Trigger.dev job triggered successfully:', {
      hasResult: !!result,
      resultKeys: Object.keys(result),
      handleId: result?.id || null,
    });
    
    return { success: true, handle: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('❌ [STAGE 7] Failed to start Gmail sync:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(`Failed to start Gmail sync: ${errorMessage}`);
  }
}

