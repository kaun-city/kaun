/**
 * A seat's affidavit is the general-election winner's. It describes the
 * sitting member only when they are the same person.
 *
 * After a by-election they are not: Wayanad's affidavit is Rahul Gandhi's,
 * its member Priyanka Gandhi Vadra; Nanded's is the late Vasantrao Chavan's,
 * its member his son Ravindra. Reading the affidavit by seat put one person's
 * declared assets, criminal cases and education on another's card, share
 * image and map layer. in_mp_affidavits.mp_id names the filer
 * (scripts/india/lib/affidavit-member.mjs); every surface goes through here.
 *
 * An affidavit with no mp_id is not shown: Kaun shows nothing rather than
 * attributing a declaration it has not tied to a member.
 */
export function affidavitOfSittingMember<A extends { mp_id: number | null }>(
  affidavit: A | null,
  mp: { id: number } | null,
): A | null {
  if (!affidavit || !mp || affidavit.mp_id == null) return null
  return affidavit.mp_id === mp.id ? affidavit : null
}
