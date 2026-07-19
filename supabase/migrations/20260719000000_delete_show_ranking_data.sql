-- Episode Ranker — delete_show_ranking_data RPC (fixes the show-removal URL-length bug)
--
-- Docs/STATUS.md Bucket 1 item 1: `session.ts`'s `deleteShowRankingData` used to pass a show's
-- *entire* episode id list as a literal comma-separated list in `.in('episode_a_id'/'episode_b_id'/
-- 'episode_id', episodeIds)` DELETE queries. Once a show has enough episodes, that URL exceeds
-- Supabase/PostgREST's URL-length limit and the request comes back 400 Bad Request instead of
-- deleting anything — meaning removing a large show (e.g. "The Challengers") was itself broken.
--
-- Unlike the read call sites in the same file (fixed by dropping the id list and filtering in
-- application code, since `.eq('user_id', ...)` alone already bounds a read to a reasonable size),
-- a DELETE can't be fixed that way — you can't delete rows you only know about from a prior SELECT,
-- the DELETE's own WHERE needs the database itself to do the filtering, without an id list ever
-- going out over HTTP. This function does exactly that: it takes p_show_id/p_user_id (two scalars,
-- no arrays) and does the episode-id filtering via a subquery joined through episodes.show_id,
-- entirely inside Postgres.
--
-- Deliberately `security invoker` (Postgres's default, but declared explicitly here, not
-- `security definer`): episode_comparisons/episode_rankings both already have RLS policies scoping
-- delete to `user_id = auth.uid()` (see 20260715000000_initial_schema.sql, ~lines 169-201). With
-- `security invoker`, those RLS policies still apply using the *caller's real* auth.uid() — so even
-- if p_user_id were somehow wrong, RLS is the actual enforcement backstop, same "defense in depth
-- on top of RLS, but RLS is what really protects it" posture session.ts's own module comment
-- documents for every other query in that file. Passing p_user_id explicitly (rather than deriving
-- it inside the function via auth.uid()) matches that same explicit-scoping style. `episodes` has
-- an "authenticated users can read" policy (any signed-in user may read the global reference
-- table), so the subqueries below work fine under RLS too.

create or replace function public.delete_show_ranking_data(p_show_id uuid, p_user_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  delete from public.episode_comparisons
  where user_id = p_user_id
    and (episode_a_id in (select id from public.episodes where show_id = p_show_id)
      or episode_b_id in (select id from public.episodes where show_id = p_show_id));

  delete from public.episode_rankings
  where user_id = p_user_id
    and episode_id in (select id from public.episodes where show_id = p_show_id);
end;
$$;

grant execute on function public.delete_show_ranking_data(uuid, uuid) to authenticated;
