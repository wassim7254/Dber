import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { getRentalDetail } from "@/domains/kraya/application/kraya-read";
import { authenticate } from "@/lib/auth/identity";
import { SaveButton } from "@/components/engagement/save-button";
import { savedItems } from "@/db/schema";
import { getSubjectRating, listReviewsForSubject } from "@/domains/engagement/reviews-service";
import { RatingStars, ReviewList } from "@/components/engagement/rating-stars";
import { Card, DberMoney, Eyebrow, Media } from "@/components/dber/ui";
import { ReservePanel } from "@/components/actions/reserve-panel";

export default async function KrayaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identity = await authenticate();
  const rental = await getRentalDetail(db, id).catch(() => null);
  if (!rental) notFound();

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[980px] space-y-6">
        <Media kind={rental.images[0] ?? rental.category} title={rental.title} className="h-64 w-full rounded-[24px] md:h-[380px]" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <header className="space-y-3">
              <Eyebrow>
                {rental.category} · KRAYA{rental.location ? ` · ${rental.location}` : ""}
              </Eyebrow>
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] md:text-[32px]">
                {rental.title}
              </h1>
              <p className="text-[14px] leading-relaxed text-muted">{rental.description}</p>
              <p className="text-[13px] text-muted">
                Owned by <span className="font-medium text-ink">{rental.ownerName}</span>
                {rental.capacity ? ` · up to ${rental.capacity} people` : ""}
              </p>
            </header>

            <Card className="p-5">
              <p className="text-[13px] font-semibold">Availability calendar</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                Blocked ranges below are held by pending or confirmed bookings. Adjacent bookings
                are allowed — a rental ends the moment the next begins.
              </p>
              <ul className="mt-3 space-y-2">
                {rental.bookedRanges.length === 0 ? (
                  <li className="text-[13px] text-success">Completely open — every date is available.</li>
                ) : (
                  rental.bookedRanges.map((range, index) => (
                    <li
                      key={`${range.start}-${index}`}
                      className="tnum flex items-center justify-between rounded-lg bg-danger-soft px-3 py-2 font-mono text-[12px] text-danger"
                    >
                      <span>Unavailable</span>
                      <span>
                        {new Date(range.start).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} →{" "}
                        {new Date(range.end).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </Card>

            <Card className="p-5">
              <p className="text-[13px] font-semibold">Deposit protection</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                The deposit of{" "}
                <DberMoney amountMinor={rental.depositMinor} currency={rental.currency} size="sm" /> is
                held as an authorization — never charged — and released automatically after return.
                It only ever becomes a charge through an explicit, audited dispute resolution.
              </p>
            </Card>
            <Card className="p-5">
              <OwnerReviews ownerId={rental.ownerId} />
            </Card>
          </div>

          <div className="lg:sticky lg:top-8 lg:self-start">
            <Card className="p-5">
              <div className="mb-3">
                <SaveButton
                  entityType="kraya_asset"
                  entityId={rental.id}
                  initiallySaved={
                    identity
                      ? (
                          await db
                            .select({ id: savedItems.id })
                            .from(savedItems)
                            .where(and(eq(savedItems.userId, identity.userId), eq(savedItems.entityType, "kraya_asset"), eq(savedItems.entityId, rental.id)))
                            .limit(1)
                        ).length > 0
                      : false
                  }
                  signedIn={identity !== null}
                />
              </div>
              <div className="mb-4 flex items-baseline justify-between">
                <div>
                  <p className="text-[12px] text-muted">Per day</p>
                  <DberMoney amountMinor={rental.dailyRateMinor} currency={rental.currency} size="lg" />
                </div>
              </div>
              <ReservePanel
                assetId={rental.id}
                dailyRateMinor={rental.dailyRateMinor}
                depositMinor={rental.depositMinor}
                currency={rental.currency}
                bookedRanges={rental.bookedRanges}
              />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

async function OwnerReviews({ ownerId }: { ownerId: string }) {
  const [rating, ownerReviews] = await Promise.all([
    getSubjectRating(db, ownerId),
    listReviewsForSubject(db, ownerId),
  ]);
  return (
    <div>
      <p className="text-[13px] font-semibold">Reviews of this owner</p>
      <div className="mt-2">
        <RatingStars average={rating.average} count={rating.count} />
      </div>
      {ownerReviews.length > 0 ? (
        <div className="mt-4 space-y-3">
          <ReviewList reviews={ownerReviews.slice(0, 3)} />
        </div>
      ) : null}
    </div>
  );
}
