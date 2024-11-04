// this new edge function replaces powersync-auth-organisation function
// it is used to get the correct powersync url and token for a given organisation based on the data_free_enabled flag
// this is used by the powersync client to connect to the correct server
// the audience is always the underlying powersync url, not the data free one

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";
import * as base64 from "https://deno.land/std@0.196.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const powerSyncPrivateKey = JSON.parse(
  new TextDecoder().decode(
    base64.decode(Deno.env.get("POWERSYNC_PRIVATE_KEY")!)
  )
) as jose.JWK;

const powerSyncKey = (await jose.importJWK(
  powerSyncPrivateKey
)) as jose.KeyLike;

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

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
      return new Response("Invalid organisationId", {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Query the organisations table to check the data_free status
    const { data, error } = await supabase
      .from("organisations")
      .select("data_free_enabled")
      .eq("id", organisationId)
      .single();

    console.log(data);

    if (error || !data) {
      return new Response("Organisation not found", {
        headers: { "Content-Type": "application/json" },
        status: 404,
      });
    }

    const dataFree = data.data_free_enabled;
    const powerSyncUrl = dataFree
      ? Deno.env.get("POWERSYNC_DATA_FREE_URL")!
      : // "https://mtn-346.datafree7.co"
        Deno.env.get("POWERSYNC_URL")!;

    // Create JWT with organisation ID
    const token = await new jose.SignJWT({})
      .setProtectedHeader({
        alg: powerSyncPrivateKey.alg!,
        kid: powerSyncPrivateKey.kid,
      })
      .setSubject(organisationId)
      .setIssuedAt()
      .setIssuer(Deno.env.get("SUPABASE_URL")!)
      .setAudience(Deno.env.get("POWERSYNC_URL")!) // audience is the always the underlying powersync url, not the data free one
      .setExpirationTime("5m")
      .sign(powerSyncKey);
    return new Response(
      JSON.stringify({
        token: token,
        powersync_url: powerSyncUrl,
        data_free: dataFree,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
