import { Pool } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts';
import * as base64 from 'https://deno.land/std@0.196.0/encoding/base64.ts';

// The goal of this edge function is to provide an Auth API endpoint
// The user will use a pin (i.e. password) to login using this Auth API endpoint
// This function will then generate a JWT for the user and return it to the user
// The JWT will include organisation specific data based on the provided pin

console.log(`Function "powersync-auth-organisation" up and running!`);

// Get authentication keys and URLs

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

// Connect to Staging Database
// Get the Database SSL certificate from AWS S3
const response = await fetch(Deno.env.get('DATABASE_SSL_CERT_STORAGE_URL')!);
// The response is of type pem, to be used for the database connection pool
const certificate = await response.text();

const pool = new Pool(
  {
    //Staging details
    tls: { caCertificates: [certificate] },
    database: 'postgres',
    hostname: 'workweek-staging.c4ffsv6b9ash.eu-west-1.rds.amazonaws.com',
    user: 'dev_admin',
    port: 5432,
    password: Deno.env.get('DATABASE_PASSWORD')!,
  },
  3, // Max number of connections
  true // Enable lazy loading
);

serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin!);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const { organisationPin } = await req.json(); // Get the organisationPin from the request body

    // Check if organisationPin is provided and is a exactly 5 chars long
    if (!organisationPin || organisationPin.length !== 5) {
      return new Response(
        JSON.stringify({
          message: 'organisationPin is required and must be 5 chars long',
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Grab a connection from the pool
    const connection = await pool.connect();

    try {
      interface Organisation {
        id: string;
        name: string;
        deleted_at: string;
      }

      // Run a query to get the organisations id based on the organisationPin
      const result =
        await connection.queryObject`SELECT o.id, o.name, o.deleted_at FROM organisations o WHERE pin = ${organisationPin};`;
      const organisation = result.rows[0] as Organisation;

      // Check if organisation was deleted
      if (organisation.deleted_at) {
        return new Response(
          JSON.stringify({
            message: 'organisation was deleted',
          }),
          { status: 404, headers: corsHeaders }
        );
      }

      // Check if organisation was found
      if (!organisation) {
        return new Response(
          JSON.stringify({
            message: 'organisation not found',
          }),
          { status: 404, headers: corsHeaders }
        );
      }

      // Create JWT token
      const token = await new jose.SignJWT({
        organisationId: organisation.id,
        organisationName: organisation.name,
      })
        .setProtectedHeader({
          alg: powerSyncPrivateKey.alg!,
          kid: powerSyncPrivateKey.kid,
        })
        .setSubject(organisation.id)
        .setIssuedAt()
        .setIssuer(supabaseUrl)
        .setAudience(powerSyncUrl)
        .setExpirationTime('5m')
        .sign(powerSyncKey);
      return new Response(
        JSON.stringify({
          token: token,
          powersync_url: powerSyncUrl,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    } finally {
      // Release the connection back to the pool
      connection.release();
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
