import { notFound } from "next/navigation";

import { db } from "@/db/client";
import { getProfessionalProfile } from "@/domains/khidma/application/khidma-read";
import { Card, DberMoney, Eyebrow } from "@/components/dber/ui";
import { Icon } from "@/components/dber/icon";
import { RequestForm } from "@/components/actions/khidma-actions";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ProfessionalProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfessionalProfile(db, id).catch(() => null);
  if (!profile) notFound();

  const initials = profile.displayName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[980px] space-y-6">
        <Card className="flex flex-col gap-5 p-6 md:flex-row md:items-center">
          <span className="flex size-20 items-center justify-center rounded-2xl bg-khidma/10 font-mono text-[22px] font-semibold text-[#54617a]">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <Eyebrow>KHIDMA · Professional</Eyebrow>
            <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">{profile.displayName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
              <span className="flex items-center gap-1.5 font-medium text-success">
                <Icon name="shield" size={14} />
                Verified professional
              </span>
              <span className="flex items-center gap-1.5">
                <Icon name="clock" size={14} />
                Typically responds within a day
              </span>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <section>
              <h2 className="mb-3 text-[17px] font-semibold">Services</h2>
              <div className="space-y-3">
                {profile.services.length === 0 ? (
                  <Card className="p-5 text-[13px] text-muted">
                    No published services yet — send a request describing what you need.
                  </Card>
                ) : (
                  profile.services.map((service) => (
                    <Card key={service.id} className="flex items-center justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold">{service.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted">
                          {service.description}
                        </p>
                        <p className="mt-1 text-[12px] text-muted">
                          {service.specialty} · {Math.round((service.durationMinutes / 60) * 10) / 10}h session
                        </p>
                      </div>
                      <DberMoney amountMinor={service.basePriceMinor} currency={service.currency} />
                    </Card>
                  ))
                )}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-[17px] font-semibold">Weekly availability</h2>
              <Card className="p-4">
                {profile.availability.length === 0 ? (
                  <p className="text-[13px] text-muted">Flexible scheduling — propose times in your request.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {profile.availability.map((slot, index) => (
                      <li
                        key={`${slot.weekday}-${slot.startMinute}-${index}`}
                        className="tnum rounded-full bg-green-soft px-3 py-1.5 font-mono text-[12px] text-green-dark"
                      >
                        {WEEKDAYS[slot.weekday]} {String(Math.floor(slot.startMinute / 60)).padStart(2, "0")}:00–
                        {String(Math.floor(slot.endMinute / 60)).padStart(2, "0")}:00
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          </div>

          <Card className="h-fit p-5 lg:sticky lg:top-8">
            <p className="text-[14px] font-semibold">Request this professional</p>
            <p className="mb-3 mt-1 text-[12.5px] leading-relaxed text-muted">
              Describe your need; they&apos;ll respond with a bound quote. Nothing is charged until
              you accept a quote and pay.
            </p>
            <RequestForm serviceId={profile.services[0]?.id} />
          </Card>
        </div>
      </div>
    </div>
  );
}
