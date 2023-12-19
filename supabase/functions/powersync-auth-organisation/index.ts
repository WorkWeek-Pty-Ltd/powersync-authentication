import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts';
import * as base64 from 'https://deno.land/std@0.196.0/encoding/base64.ts';

const powerSyncPrivateKey = JSON.parse(
  new TextDecoder().decode(
    base64.decode(Deno.env.get('POWERSYNC_PRIVATE_KEY')!)
  )
) as jose.JWK;

const powerSyncKey = (await jose.importJWK(
  powerSyncPrivateKey
)) as jose.KeyLike;

const powerSyncUrl = Deno.env.get('POWERSYNC_URL')!;
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

serve(async (req: Request) => {
  try {
    // Get the organisationId from the request body
    const { organisationId } = await req.json();

    // Check if organisationId is provided and is a valid UUID
    if (
      !organisationId ||
      !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/i.test(
        organisationId
      )
    ) {
      return new Response('Invalid organisationId', {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Create JWT with organisation ID
    const token = await new jose.SignJWT({})
      .setProtectedHeader({
        alg: powerSyncPrivateKey.alg!,
        kid: powerSyncPrivateKey.kid,
      })
      .setSubject(organisationId)
      .setIssuedAt()
      .setIssuer(supabaseUrl)
      .setAudience(powerSyncUrl)
      .setExpirationTime('5m')
      .sign(powerSyncKey);
    return new Response(
      JSON.stringify({
        token: token,
        powersync_url: powerSyncUrl!,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
