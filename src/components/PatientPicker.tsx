"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Patient } from "@/lib/auth";

export function PatientPicker({
  idPrefix,
  patients,
  value,
  onChange,
}: {
  idPrefix: string;
  patients: Patient[];
  value: string;
  onChange: (patientId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(!value);
  const [previousValue, setPreviousValue] = useState(value);
  const selected = patients.find((patient) => patient.id === value) ?? null;

  if (value !== previousValue) {
    setPreviousValue(value);
    if (!value) setSearchOpen(true);
  }

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter((patient) =>
      [patient.fullName, patient.diagnosis, patient.phone].some((field) =>
        field.toLowerCase().includes(term),
      ),
    );
  }, [patients, query]);

  function choose(patient: Patient) {
    onChange(patient.id);
    setQuery("");
    setSearchOpen(false);
  }

  return (
    <div>
      <label
        htmlFor={searchOpen ? `${idPrefix}-patient-search` : undefined}
        className="mb-1.5 block text-xs font-medium text-slate-700"
      >
        Patient receiving treatment <span className="text-danger">*</span>
      </label>

      {selected ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand/30 bg-brand-soft/30 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{selected.fullName}</p>
            {selected.diagnosis ? (
              <p className="truncate text-xs text-muted">{selected.diagnosis}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="shrink-0 text-xs font-semibold text-brand-strong underline"
          >
            Change patient
          </button>
        </div>
      ) : null}

      {searchOpen ? (
        <div>
          <input
            id={`${idPrefix}-patient-search`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search patients by name, diagnosis or phone"
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-brand/20 transition placeholder:text-slate-400 focus:border-brand focus:ring-4"
          />
          <ul
            aria-label="Patient search results"
            className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border bg-white p-1.5"
          >
            {results.length === 0 ? (
              <li className="px-2 py-2 text-xs text-muted">
                No approved patients match “{query}”.
              </li>
            ) : (
              results.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => choose(patient)}
                    aria-pressed={patient.id === value}
                    className={`flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition ${
                      patient.id === value
                        ? "bg-brand-soft/50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate text-sm font-medium text-slate-900">
                      {patient.fullName}
                    </span>
                    {patient.diagnosis ? (
                      <span className="truncate text-xs text-muted">{patient.diagnosis}</span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {patients.length === 0 ? (
        <p className="mt-1.5 text-xs text-danger">
          No approved patients yet.{" "}
          <Link href="/onboarding" className="font-medium underline">
            Add a patient
          </Link>{" "}
          and get approval first.
        </p>
      ) : null}
    </div>
  );
}
