"use client";

import { SignOutButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

import {
  acceptTiedWinnersAction,
  bulkUpdateMemberEligibilityAction,
  createNominationsAction,
  createRunoffAction,
  deleteCategoryAction,
  publishWinnersAction,
  resetAwardsRunAction,
  submitBallotAction,
  syncClerkRosterAction,
  updateMemberEligibilityAction,
  updateCycleStageAction,
  upsertCategoryAction,
} from "@/app/actions";
import { getMemberPhaseAccess } from "@/lib/awards/phase";
import {
  buildNominationDirectory,
  formatCategoryVotingSummary,
  getIncompleteBallotCategoryTitles,
  groupNominationsByNominator,
  hasSubmittedCompleteNominationBallot,
  toggleSelection,
} from "@/lib/awards/workflow.mjs";
import type { Category, Finalist, Member } from "@/lib/awards/data";
import type { AwardPortalModel } from "@/lib/awards/repository";
import type { CurrentUser } from "@/lib/auth/service";

type VoteSelections = Record<string, string>;
type DirectoryMember = Member & { isSelf: boolean; selectable: boolean };
type NominationDraft = { nomineeId: string; statement: string };
type NominationReviewGroup = {
  nominator?: Member;
  nominatorId: string;
  nominatorName: string;
  nominations: {
    categoryTitle: string;
    id: string;
    nomineeName: string;
    statement: string;
  }[];
};
type PrivateResult = AwardPortalModel["privateResults"][number];
type HeaderNavItem = {
  active: boolean;
  href: string;
  label: string;
};
type PortalResult = {
  count?: number;
  demo?: boolean;
  error?: string;
  ok: boolean;
  confirmationCode?: string;
  awardsEligible?: boolean;
};
type CelebrationMotionStyle = CSSProperties & Record<`--${string}`, string>;

function CategoryCompletionTick() {
  return <span aria-label="Category selected" className="category-complete-check" role="img" />;
}

function CategoryNavigationArrows({
  disabled,
  nextDisabled,
  nextGlows,
  onNext,
  onPrevious,
  previousDisabled,
  previousGlows,
}: {
  disabled: boolean;
  nextDisabled: boolean;
  nextGlows: boolean;
  onNext: () => void;
  onPrevious: () => void;
  previousDisabled: boolean;
  previousGlows: boolean;
}) {
  return (
    <div aria-label="Category navigation" className="floating-category-nav">
      <button
        aria-label="Previous category"
        className={[
          "floating-category-arrow",
          "is-left",
          previousGlows ? "is-guiding" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled || previousDisabled}
        onClick={onPrevious}
        type="button"
      />
      <button
        aria-label="Next category"
        className={[
          "floating-category-arrow",
          "is-right",
          nextGlows ? "is-guiding" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled || nextDisabled}
        onClick={onNext}
        type="button"
      />
    </div>
  );
}

function useAutoDismissMessage(
  message: string | null,
  setMessage: (message: string | null) => void,
  delayMs = 4200,
) {
  useEffect(() => {
    if (!message) return;

    const timer = window.setTimeout(() => setMessage(null), delayMs);

    return () => window.clearTimeout(timer);
  }, [delayMs, message, setMessage]);
}

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const CELEBRATION_COLORS = ["#efc76d", "#176b60", "#8d3b5c", "#2d7fba", "#f3a83b", "#2f8f83", "#bf3f65"];

function seededValue(index: number, salt: number) {
  const value = Math.sin((index + 1) * (salt + 17.137)) * 10000;
  return value - Math.floor(value);
}

function range(index: number, salt: number, min: number, max: number) {
  return min + seededValue(index, salt) * (max - min);
}

function signedRange(index: number, salt: number, distance: number) {
  return range(index, salt, -distance, distance);
}

function fixed(value: number, precision = 2) {
  return value.toFixed(precision);
}

const CONFETTI_PIECES = Array.from({ length: 64 }, (_, index) => {
  const color = CELEBRATION_COLORS[Math.floor(seededValue(index, 8) * CELEBRATION_COLORS.length)];
  const style: CelebrationMotionStyle = {
    "--confetti-x1": `${fixed(signedRange(index, 1, 72))}px`,
    "--confetti-x2": `${fixed(signedRange(index, 2, 118))}px`,
    "--confetti-x3": `${fixed(signedRange(index, 3, 92))}px`,
    "--confetti-x4": `${fixed(signedRange(index, 4, 132))}px`,
    "--confetti-x5": `${fixed(signedRange(index, 5, 150))}px`,
    "--confetti-rot1": `${fixed(range(index, 9, 70, 280), 0)}deg`,
    "--confetti-rot2": `${fixed(range(index, 10, 280, 650), 0)}deg`,
    "--confetti-rot3": `${fixed(range(index, 11, 650, 980), 0)}deg`,
    "--confetti-rot4": `${fixed(range(index, 12, 980, 1320), 0)}deg`,
    "--confetti-rot5": `${fixed(range(index, 13, 1320, 1820), 0)}deg`,
    "--piece-color": color,
    "--piece-delay": `${fixed(-range(index, 14, 0, 10.8))}s`,
    "--piece-duration": `${fixed(range(index, 15, 5.8, 11.4))}s`,
    "--piece-height": `${fixed(range(index, 16, 10, 25))}px`,
    "--piece-left": `${fixed(range(index, 17, -4, 104))}vw`,
    "--piece-radius": `${fixed(range(index, 18, 2, 9))}px`,
    "--piece-width": `${fixed(range(index, 19, 5, 11))}px`,
  };

  return { id: index + 1, style };
});

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Mark() {
  return (
    <Image
      alt="GRA"
      className="brand-logo"
      height={54}
      priority
      src="/brand/gra-logo.png"
      width={142}
    />
  );
}

function PersonAvatar({ member, name }: { member?: Pick<Member, "name" | "photoUrl">; name: string }) {
  const photoUrl = member?.photoUrl;

  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={photoUrl} alt={name} />;
  }

  return (
    <span className="avatar" aria-hidden="true">
      {initials(member?.name ?? name)}
    </span>
  );
}

function ProfilePill({ currentUser }: { currentUser: CurrentUser }) {
  return (
    <div className="profile-pill">
      <PersonAvatar member={currentUser.member} name={currentUser.member.name} />
      <span>{currentUser.member.name}</span>
      {clerkEnabled ? (
        <SignOutButton>
          <button className="profile-signout" type="button">
            Sign out
          </button>
        </SignOutButton>
      ) : null}
    </div>
  );
}

function Header({
  active,
}: {
  active: "admin" | "member" | "public";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const navItems = useMemo<HeaderNavItem[]>(() => {
    const items = [
      { active: active === "public", href: "/", label: "Public" },
      { active: active === "member", href: "/member", label: "Awards Portal" },
    ];

    if (active === "admin") {
      items.push({ active: true, href: "/admin", label: "Admin" });
    }

    return items;
  }, [active]);

  useEffect(() => {
    for (const item of navItems) {
      router.prefetch(item.href);
    }
  }, [navItems, router]);

  const visiblePendingHref = pendingHref === pathname ? null : pendingHref;

  function prefetch(href: string) {
    router.prefetch(href);
  }

  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="O&P Awards home">
        <Mark />
      </Link>
      <nav className="nav-links" aria-label="O&P Awards navigation">
        {navItems.map((item) => (
          <Link
            aria-current={item.active ? "page" : undefined}
            className={[
              item.active ? "is-active" : "",
              visiblePendingHref === item.href ? "is-pending" : "",
            ].filter(Boolean).join(" ")}
            href={item.href}
            key={item.href}
            onClick={() => {
              if (pathname !== item.href) {
                setPendingHref(item.href);
              }
            }}
            onFocus={() => prefetch(item.href)}
            onMouseEnter={() => prefetch(item.href)}
            prefetch
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function StagePill({ stage }: { stage: string }) {
  return <span className="stage-pill">{stage}</span>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="empty-state">{message}</div>;
}

function FullPageConfetti() {
  return (
    <div className="confetti-overlay" aria-hidden="true">
      {CONFETTI_PIECES.map((piece) => (
        <span className="confetti-piece" key={piece.id} style={piece.style} />
      ))}
    </div>
  );
}

function PublicWinners({ model }: { model: AwardPortalModel }) {
  const published = model.cycle.stage === "Published";
  const winners = model.results.filter((result) => published && result.leader !== "Pending");
  const winnerCards = winners.flatMap((result) => {
    const resultWinners = result.winners?.length
      ? result.winners
      : result.leader.split(",").map((name) => ({ name: name.trim(), photoUrl: null }));

    return resultWinners.map((winner) => ({
      category: result.category,
      key: `${result.category}-${winner.name}`,
      name: winner.name,
      photoUrl: winner.photoUrl,
    }));
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Results</p>
          <h2>{published ? "Winners" : "Not published"}</h2>
        </div>
      </div>
      {published ? (
        <div className="celebration-scene" aria-label="Winner celebration">
          <div>
            <h3>Congratulations</h3>
          </div>
        </div>
      ) : null}
      {published ? (
        <div className="winner-card-grid">
          {winnerCards.map((winner) => (
            <article className="winner-card" key={winner.key}>
              <PersonAvatar member={{ name: winner.name, photoUrl: winner.photoUrl }} name={winner.name} />
              <span>
                <small>{winner.category}</small>
                <strong>{winner.name}</strong>
              </span>
            </article>
          ))}
        </div>
      ) : (
        <div className="result-list">
          {model.results.map((result) => (
            <div className="result-row" key={result.category}>
              <span>{result.category}</span>
              <strong>Not published</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function getStageAction(stage: string) {
  const access = getMemberPhaseAccess(stage);

  if (access.canNominate) return "Nomination is open until all members complete it.";
  if (access.canVote) return "Voting is open until all members submit.";
  if (access.label === "Published") return "Winners are live.";
  if (access.label === "Review") return "Admin review is in progress.";
  if (access.label === "Certification") return "Results are being reviewed.";

  return "The next cycle is being prepared.";
}

function PublicCycleStatus({ model }: { model: AwardPortalModel }) {
  return (
    <section className="status-strip" aria-label="Current awards status">
      <strong>Current cycle</strong>
      <span>{getStageAction(model.cycle.stage)}</span>
    </section>
  );
}

export function PublicAwardsPage({ model }: { model: AwardPortalModel }) {
  return (
    <main className="app-shell">
      {model.cycle.stage === "Published" ? <FullPageConfetti /> : null}
      <Header active="public" />
      <section className="hero-panel public-hero">
        <div>
          <h1>{model.cycle.title}</h1>
        </div>
      </section>
      {model.cycle.stage !== "Published" ? <PublicCycleStatus model={model} /> : null}
      <PublicWinners model={model} />
    </main>
  );
}

function MemberDirectory({
  currentMemberId,
  members,
  selectedNominee,
  setSelectedNominee,
}: {
  currentMemberId: string;
  members: Member[];
  selectedNominee: string;
  setSelectedNominee: (memberId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredMembers = useMemo(
    () =>
      buildNominationDirectory({
        currentMemberId,
        members,
        query,
      }) as DirectoryMember[],
    [currentMemberId, members, query],
  );

  return (
    <div className="directory-block">
      <input
        aria-label="Search members"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search people"
        type="search"
        value={query}
      />
      <div className="people-list member-card-grid">
        {filteredMembers.map((member) => {
          const isSelected = selectedNominee === member.id;

          return (
            <button
              aria-label={member.name}
              aria-pressed={isSelected}
              className={[
                "person-card",
                isSelected ? "is-selected" : "",
                member.isSelf ? "is-self" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={!member.selectable}
              key={member.id}
              onClick={() => setSelectedNominee(toggleSelection(selectedNominee, member.id))}
              type="button"
            >
              {isSelected ? <span aria-hidden="true" className="selection-check" /> : null}
              <PersonAvatar member={member} name={member.name} />
              <span>
                <strong>{member.name}</strong>
              </span>
              {member.isSelf ? <span className="self-badge">You</span> : null}
            </button>
          );
        })}
      </div>
      {filteredMembers.length === 0 ? <EmptyState message="No matching members." /> : null}
    </div>
  );
}

function NominationExperience({
  currentUser,
  model,
}: {
  currentUser: CurrentUser;
  model: AwardPortalModel;
}) {
  const activeCategories = useMemo(
    () =>
      model.categories.filter(
        (category) =>
          category.active &&
          category.kind !== "runoff" &&
          (category.ballotScope ?? "main") === "main",
      ),
    [model.categories],
  );
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
  const [nominationDrafts, setNominationDrafts] = useState<Record<string, NominationDraft>>({});
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const categoryHeaderRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusCategoryRef = useRef(false);
  const safeCategoryIndex = Math.min(
    currentCategoryIndex,
    Math.max(activeCategories.length - 1, 0),
  );
  const currentCategory = activeCategories[safeCategoryIndex];
  const selectedDraft = currentCategory
    ? nominationDrafts[currentCategory.id] ?? { nomineeId: "", statement: "" }
    : { nomineeId: "", statement: "" };
  const hasSubmittedNominations =
    submitted ||
    hasSubmittedCompleteNominationBallot({
      categories: activeCategories,
      memberId: currentUser.member.id,
      nominations: model.nominations,
    });
  const currentCategoryHasSelection = Boolean(selectedDraft.nomineeId);
  const hasIncompletePreviousCategory = activeCategories
    .slice(0, safeCategoryIndex)
    .some((category) => !nominationDrafts[category.id]?.nomineeId);
  const allCategoriesSelected =
    activeCategories.length > 0 &&
    activeCategories.every((category) => Boolean(nominationDrafts[category.id]?.nomineeId));

  const focusCategoryHeader = useCallback(() => {
    window.requestAnimationFrame(() => {
      categoryHeaderRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      categoryHeaderRef.current?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    if (!shouldFocusCategoryRef.current || !currentCategory) return;

    shouldFocusCategoryRef.current = false;
    focusCategoryHeader();
  }, [currentCategory, focusCategoryHeader]);

  function goToCategory(index: number) {
    setMessage(null);
    const nextIndex = Math.min(Math.max(index, 0), activeCategories.length - 1);

    shouldFocusCategoryRef.current = true;
    setCurrentCategoryIndex(nextIndex);
    if (nextIndex === safeCategoryIndex) focusCategoryHeader();
  }

  function selectNominee(categoryId: string, nomineeId: string) {
    setMessage(null);
    const nextNomineeId = toggleSelection(nominationDrafts[categoryId]?.nomineeId ?? "", nomineeId);

    setNominationDrafts((current) => ({
      ...current,
      [categoryId]: {
        statement: current[categoryId]?.statement ?? "",
        nomineeId: nextNomineeId,
      },
    }));
  }

  function submitNomination() {
    setMessage(null);
    startTransition(async () => {
      const result = (await createNominationsAction({
        nominations: activeCategories.map((category) => ({
          categoryId: category.id,
          nomineeId: nominationDrafts[category.id]?.nomineeId ?? "",
          statement: "",
        })),
      })) as PortalResult;

      setMessage(result.ok ? null : result.error ?? "Unable to save.");
      if (result.ok) setSubmitted(true);
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="panel work-panel">
      {hasSubmittedNominations ? (
        <div className="notice good">
          Nominations submitted. Voting opens when every eligible member has submitted.
        </div>
      ) : null}
      {activeCategories.length === 0 ? <EmptyState message="No active categories yet." /> : null}
      {!hasSubmittedNominations && currentCategory ? (
        <>
          <section className="ballot-category guided-ballot" key={currentCategory.id}>
            <div className="ballot-category-head sticky-category-head" ref={categoryHeaderRef} tabIndex={-1}>
              <span>
                Category {safeCategoryIndex + 1} of {activeCategories.length}
              </span>
              <div className="ballot-category-title">
                <strong>{currentCategory.title}</strong>
                {currentCategoryHasSelection ? <CategoryCompletionTick /> : null}
              </div>
            </div>
            <MemberDirectory
              currentMemberId={currentUser.member.id}
              members={model.members}
              selectedNominee={selectedDraft.nomineeId}
              setSelectedNominee={(memberId) => selectNominee(currentCategory.id, memberId)}
            />
          </section>
          <CategoryNavigationArrows
            disabled={pending}
            nextDisabled={safeCategoryIndex >= activeCategories.length - 1}
            nextGlows={currentCategoryHasSelection && safeCategoryIndex < activeCategories.length - 1}
            onNext={() => goToCategory(safeCategoryIndex + 1)}
            onPrevious={() => goToCategory(safeCategoryIndex - 1)}
            previousDisabled={safeCategoryIndex === 0}
            previousGlows={hasIncompletePreviousCategory}
          />
          {allCategoriesSelected ? (
            <button
              className="primary-action is-ready"
              disabled={pending}
              onClick={submitNomination}
              type="button"
            >
              {pending ? "Submitting" : "Submit nominations"}
            </button>
          ) : null}
        </>
      ) : null}
      {message ? <div className="notice">{message}</div> : null}
    </section>
  );
}

function FinalistCard({
  category,
  finalist,
  member,
  selected,
  setSelected,
}: {
  category: Category;
  finalist: Finalist;
  member?: Member;
  selected: boolean;
  setSelected: (finalistId: string) => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={selected ? "finalist-card is-selected" : "finalist-card"}
      onClick={() => setSelected(finalist.id)}
      type="button"
    >
      {selected ? <span aria-hidden="true" className="selection-check" /> : null}
      <PersonAvatar member={member ?? { name: finalist.displayName, photoUrl: finalist.photoUrl }} name={finalist.displayName} />
      <span>
        <strong>{finalist.displayName}</strong>
        <small>{category.title}</small>
      </span>
    </button>
  );
}

function VotingExperience({ model }: { model: AwardPortalModel }) {
  const [selections, setSelections] = useState<VoteSelections>({});
  const [receipt, setReceipt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const categoryHeaderRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusCategoryRef = useRef(false);
  const memberById = useMemo(
    () => new Map(model.members.map((member) => [member.id, member])),
    [model.members],
  );
  const eligibleMemberIds = useMemo(
    () =>
      new Set(
        model.members
          .filter((member) => member.awardsEligible !== false)
          .map((member) => member.id),
      ),
    [model.members],
  );
  const visibleFinalists = useMemo(
    () => model.finalists.filter((finalist) => eligibleMemberIds.has(finalist.nomineeId)),
    [eligibleMemberIds, model.finalists],
  );
  const categoriesWithFinalists = useMemo(
    () =>
      model.categories.filter((category) =>
        category.active &&
        category.ballotScope === model.currentBallotScope &&
        visibleFinalists.some(
          (finalist) => finalist.categoryId === category.id && finalist.status === "approved",
        ),
      ),
    [model.categories, model.currentBallotScope, visibleFinalists],
  );
  const safeCategoryIndex = Math.min(
    currentCategoryIndex,
    Math.max(categoriesWithFinalists.length - 1, 0),
  );
  const currentCategory = categoriesWithFinalists[safeCategoryIndex];
  const currentFinalists = useMemo(
    () =>
      currentCategory
        ? visibleFinalists.filter(
            (finalist) =>
              finalist.categoryId === currentCategory.id &&
              finalist.status === "approved",
          )
        : [],
    [currentCategory, visibleFinalists],
  );
  const submittedReceipt = receipt ?? model.currentMemberVoteReceipt?.confirmationCode ?? null;
  const currentCategoryHasSelection = Boolean(
    currentCategory && selections[currentCategory.id],
  );
  const hasIncompletePreviousCategory = categoriesWithFinalists
    .slice(0, safeCategoryIndex)
    .some((category) => !selections[category.id]);
  const allBallotCategoriesSelected =
    categoriesWithFinalists.length > 0 &&
    categoriesWithFinalists.every((category) => Boolean(selections[category.id]));

  const focusCategoryHeader = useCallback(() => {
    window.requestAnimationFrame(() => {
      categoryHeaderRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      categoryHeaderRef.current?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    if (!shouldFocusCategoryRef.current || !currentCategory) return;

    shouldFocusCategoryRef.current = false;
    focusCategoryHeader();
  }, [currentCategory, focusCategoryHeader]);

  function goToCategory(index: number) {
    setMessage(null);
    const nextIndex = Math.min(Math.max(index, 0), categoriesWithFinalists.length - 1);

    shouldFocusCategoryRef.current = true;
    setCurrentCategoryIndex(nextIndex);
    if (nextIndex === safeCategoryIndex) focusCategoryHeader();
  }

  function selectFinalist(categoryId: string, finalistId: string) {
    setMessage(null);
    const nextSelection = toggleSelection(selections[categoryId] ?? "", finalistId);

    setSelections((current) => {
      const next = { ...current };

      if (nextSelection) {
        next[categoryId] = nextSelection;
      } else {
        delete next[categoryId];
      }

      return next;
    });
  }

  function submitBallot() {
    setMessage(null);
    const missingCategories = getIncompleteBallotCategoryTitles({
      categories: categoriesWithFinalists,
      selections,
    });

    if (missingCategories.length > 0) {
      const firstMissingIndex = categoriesWithFinalists.findIndex(
        (category) => !selections[category.id],
      );

      if (firstMissingIndex >= 0) {
        shouldFocusCategoryRef.current = true;
        setCurrentCategoryIndex(firstMissingIndex);
        if (firstMissingIndex === safeCategoryIndex) focusCategoryHeader();
      }

      setMessage(`Select a vote for: ${missingCategories.join(", ")}.`);
      return;
    }

    startTransition(async () => {
      const result = (await submitBallotAction({
        ballotScope: model.currentBallotScope,
        cycleId: model.cycle.id,
        selections,
      })) as PortalResult;

      if (result.ok) {
        setReceipt(result.confirmationCode ?? "OP-RECORDED");
        setMessage(null);
        router.refresh();
      } else {
        setMessage(result.error ?? "Unable to submit ballot.");
      }
    });
  }

  return (
    <section className="panel work-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Ballot</p>
          <h2>{model.currentBallotScope === "main" ? "Vote by category" : "Runoff ballot"}</h2>
        </div>
      </div>
      {submittedReceipt ? (
        <div className="notice good">
          Voting submitted. Results will be available after voting closes and admin publishes winners. Receipt {submittedReceipt}
        </div>
      ) : null}
      {categoriesWithFinalists.length === 0 ? <EmptyState message="No ballot is ready yet." /> : null}
      {!submittedReceipt && currentCategory ? (
        <>
          <section className="ballot-category guided-ballot" key={currentCategory.id}>
            <div className="ballot-category-head sticky-category-head" ref={categoryHeaderRef} tabIndex={-1}>
              <span>
                Category {safeCategoryIndex + 1} of {categoriesWithFinalists.length}
              </span>
              <div className="ballot-category-title">
                <strong>{currentCategory.title}</strong>
                {currentCategoryHasSelection ? <CategoryCompletionTick /> : null}
              </div>
            </div>
            <div className="finalist-grid">
              {currentFinalists.map((finalist) => (
                <FinalistCard
                  category={currentCategory}
                  finalist={finalist}
                  key={finalist.id}
                  member={memberById.get(finalist.nomineeId)}
                  selected={selections[currentCategory.id] === finalist.id}
                  setSelected={(finalistId) => selectFinalist(currentCategory.id, finalistId)}
                />
              ))}
            </div>
          </section>
          <CategoryNavigationArrows
            disabled={pending}
            nextDisabled={safeCategoryIndex >= categoriesWithFinalists.length - 1}
            nextGlows={
              currentCategoryHasSelection &&
              safeCategoryIndex < categoriesWithFinalists.length - 1
            }
            onNext={() => goToCategory(safeCategoryIndex + 1)}
            onPrevious={() => goToCategory(safeCategoryIndex - 1)}
            previousDisabled={safeCategoryIndex === 0}
            previousGlows={hasIncompletePreviousCategory}
          />
          <button
            className={["primary-action", allBallotCategoriesSelected ? "is-ready" : ""]
              .filter(Boolean)
              .join(" ")}
            disabled={categoriesWithFinalists.length === 0 || pending}
            onClick={submitBallot}
            type="button"
          >
            {pending ? "Submitting" : "Submit ballot"}
          </button>
        </>
      ) : null}
      {message ? <div className="notice warn">{message}</div> : null}
    </section>
  );
}

export function MemberAwardsPage({
  currentUser,
  model,
}: {
  currentUser: CurrentUser;
  model: AwardPortalModel;
}) {
  const access = getMemberPhaseAccess(model.cycle.stage);
  const canParticipate = currentUser.member.awardsEligible !== false;

  return (
    <main className="app-shell">
      <Header active="member" />
      <section className="member-hero">
        <div>
          <p className="eyebrow">Awards Portal</p>
          <h1>{access.label}</h1>
          {model.cycle.stage !== "Published" ? <p>{access.message}</p> : null}
        </div>
        <ProfilePill currentUser={currentUser} />
      </section>
      {!canParticipate ? (
        <section className="panel">
          <EmptyState message="You are not currently included in this awards run." />
        </section>
      ) : null}
      {canParticipate && access.canNominate ? (
        <NominationExperience currentUser={currentUser} model={model} />
      ) : null}
      {canParticipate && access.canVote ? (
        <VotingExperience model={model} />
      ) : null}
      {canParticipate && !access.canNominate && !access.canVote && model.cycle.stage !== "Published" ? (
        <section className="panel">
          <EmptyState message={access.message} />
        </section>
      ) : null}
    </main>
  );
}

function AdminRoster({ model }: { model: AwardPortalModel }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  useAutoDismissMessage(message, setMessage);

  function syncRoster() {
    setMessage(null);
    startTransition(async () => {
      const result = (await syncClerkRosterAction()) as PortalResult;
      setMessage(result.ok ? `Synced ${result.count ?? 0} members.` : result.error ?? "Sync failed.");
      if (result.ok) router.refresh();
    });
  }

  function updateMemberEligibility(memberId: string, awardsEligible: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = (await updateMemberEligibilityAction({
        awardsEligible,
        memberId,
      })) as PortalResult;
      setMessage(
        result.ok
          ? awardsEligible
            ? "Member can participate."
            : "Member excluded from this run."
          : result.error ?? "Unable to update member.",
      );
      if (result.ok) router.refresh();
    });
  }

  function bulkUpdateEligibility(awardsEligible: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = (await bulkUpdateMemberEligibilityAction({ awardsEligible })) as PortalResult;
      setMessage(
        result.ok
          ? `${result.count ?? 0} members ${awardsEligible ? "enabled" : "excluded"}.`
          : result.error ?? "Unable to update members.",
      );
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="panel roster-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Clerk roster</p>
          <h2>Members</h2>
        </div>
        <div className="row-actions">
          <button
            className="secondary-action"
            disabled={pending}
            onClick={() => bulkUpdateEligibility(true)}
            type="button"
          >
            Enable all
          </button>
          <button
            className="secondary-action"
            disabled={pending}
            onClick={() => bulkUpdateEligibility(false)}
            type="button"
          >
            Disable all
          </button>
          <button className="secondary-action" disabled={pending} onClick={syncRoster} type="button">
            {pending ? "Syncing" : "Sync members"}
          </button>
        </div>
      </div>
      <div className="people-list admin-roster-list">
        {model.members.map((member) => (
          <div className="compact-row admin-roster-card" key={member.id}>
            <PersonAvatar member={member} name={member.name} />
            <span>
              <strong>{member.name}</strong>
              <small>{member.email}</small>
            </span>
            <label className="participation-switch">
              <input
                checked={member.awardsEligible !== false}
                disabled={pending}
                onChange={(event) => updateMemberEligibility(member.id, event.target.checked)}
                type="checkbox"
              />
              <span>{member.awardsEligible !== false ? "Eligible" : "Excluded"}</span>
            </label>
          </div>
        ))}
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </section>
  );
}

function AdminCycle({ model }: { model: AwardPortalModel }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  useAutoDismissMessage(message, setMessage);
  const progress = model.progress;
  const canOpenNominations = model.cycle.configuredStage === "Draft";
  const canPublish = model.cycle.stage === "Certification" && !model.hasUnresolvedTies;
  const canShowPublish = model.cycle.stage === "Certification" || model.cycle.stage === "Published";

  function openNominations() {
    setMessage(null);
    startTransition(async () => {
      const result = (await updateCycleStageAction({
        cycleId: model.cycle.id,
        stage: "nominations",
      })) as PortalResult;

      setMessage(result.ok ? "Nominations opened." : result.error ?? "Unable to open nominations.");
      if (result.ok) router.refresh();
    });
  }

  function publishWinners() {
    setMessage(null);
    startTransition(async () => {
      const result = (await publishWinnersAction(model.cycle.id)) as PortalResult;

      setMessage(result.ok ? "Winners published." : result.error ?? "Unable to publish winners.");
      if (result.ok) router.refresh();
    });
  }

  function resetAwardsRun() {
    const confirmed = window.confirm(
      "Reset this awards run? This clears categories, nominations, finalists, votes, receipts, certifications, and published results for the current cycle. Members, photos, and admin access stay intact.",
    );

    if (!confirmed) return;

    setMessage(null);
    startTransition(async () => {
      const result = (await resetAwardsRunAction({
        confirmed: true,
        cycleId: model.cycle.id,
      })) as PortalResult;

      setMessage(
        result.ok
          ? `Awards run reset. ${result.count ?? 0} members enabled.`
          : result.error ?? "Unable to reset awards run.",
      );
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="panel command-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Cycle</p>
          <h2>{model.cycle.title}</h2>
        </div>
        <StagePill stage={model.cycle.stage} />
      </div>
      <div className="progress-grid">
        <div className="progress-tile">
          <span>Eligible members</span>
          <strong>{progress.eligibleMemberCount}</strong>
        </div>
        <div className="progress-tile">
          <span>Nominations complete</span>
          <strong>
            {progress.nominationCompletionCount}/{progress.eligibleMemberCount}
          </strong>
        </div>
        <div className="progress-tile">
          <span>Categories ready</span>
          <strong>
            {progress.approvedCategoryCount}/{progress.activeCategoryCount}
          </strong>
        </div>
        <div className="progress-tile">
          <span>Votes submitted</span>
          <strong>
            {progress.voteReceiptCount}/{progress.eligibleMemberCount}
          </strong>
        </div>
      </div>
      <div className="progress-note">
        <strong>Flow</strong>
        <span>
          Nominations stay open until every eligible member completes every active category.
          Voting stays open until every eligible member submits one ballot.
        </span>
      </div>
      <div className="cycle-actions">
        <div className="cycle-action-copy">
          <span>Review, results, and publishing stay under admin control.</span>
          {model.hasUnresolvedTies ? (
            <span>Resolve tied categories with joint winners or a runoff.</span>
          ) : null}
        </div>
        <div className="cycle-action-buttons">
          {canOpenNominations ? (
            <button className="secondary-action" disabled={pending} onClick={openNominations} type="button">
              Open nominations
            </button>
          ) : null}
          {canShowPublish ? (
            <button
              className="primary-action"
              disabled={pending || !canPublish}
              onClick={publishWinners}
              type="button"
            >
              {pending ? "Publishing" : model.cycle.stage === "Published" ? "Published" : "Publish winners"}
            </button>
          ) : null}
          <button className="danger-action" disabled={pending} onClick={resetAwardsRun} type="button">
            Reset awards run
          </button>
        </div>
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </section>
  );
}

function AdminCategoryManager({ model }: { model: AwardPortalModel }) {
  const blankCategory = {
    categoryId: "",
    title: "",
  };
  const [categoryForm, setCategoryForm] = useState(blankCategory);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const categoryNameInputRef = useRef<HTMLInputElement | null>(null);
  const modalScrollYRef = useRef(0);
  const router = useRouter();
  useAutoDismissMessage(message, setMessage);

  useEffect(() => {
    if (!categoryModalOpen) return;

    const scrollY = modalScrollYRef.current;
    const originalOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY });
      categoryNameInputRef.current?.focus({ preventScroll: true });
    });

    return () => {
      document.body.style.overflow = originalOverflow;
      window.requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
    };
  }, [categoryModalOpen]);

  function openNewCategory() {
    modalScrollYRef.current = window.scrollY;
    setMessage(null);
    setCategoryForm(blankCategory);
    setCategoryModalOpen(true);
  }

  function editCategory(category: Category) {
    modalScrollYRef.current = window.scrollY;
    setMessage(null);
    setCategoryForm({
      categoryId: category.id,
      title: category.title,
    });
    setCategoryModalOpen(true);
  }

  function closeCategoryModal() {
    if (pending) return;
    setCategoryForm(blankCategory);
    setCategoryModalOpen(false);
  }

  function saveCategory() {
    setMessage(null);
    startTransition(async () => {
      const result = (await upsertCategoryAction(categoryForm)) as PortalResult;
      setMessage(result.ok ? "Category saved." : result.error ?? "Unable to save category.");
      if (result.ok) {
        setCategoryModalOpen(false);
        setCategoryForm(blankCategory);
        router.refresh();
      }
    });
  }

  function deleteCategory(category: Category) {
    const confirmed = window.confirm(
      `Delete ${category.title}? Existing nominations, finalists, and votes for this category will also be removed.`,
    );

    if (!confirmed) return;

    setMessage(null);
    startTransition(async () => {
      const result = (await deleteCategoryAction(category.id)) as PortalResult;
      setMessage(result.ok ? "Category deleted." : result.error ?? "Unable to delete category.");
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="panel category-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Categories</p>
          <h2>Voting categories</h2>
        </div>
        <button className="secondary-action" onClick={openNewCategory} type="button">
          New
        </button>
      </div>
      <div className="compact-list category-list">
        {model.categories.map((category) => (
          <article className="compact-row category-edit-row" key={category.id}>
            <span>
              <strong>{category.title}</strong>
              <small>
                {formatCategoryVotingSummary(category, model.progress.eligibleMemberCount)}
              </small>
            </span>
            <div className="row-actions">
              <button
                className="secondary-action"
                disabled={pending}
                onClick={() => editCategory(category)}
                type="button"
              >
                Edit
              </button>
              <button
                className="danger-action"
                disabled={pending}
                onClick={() => deleteCategory(category)}
                type="button"
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
      {message ? <div className="notice">{message}</div> : null}
      {categoryModalOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCategoryModal();
          }}
          role="presentation"
        >
          <div
            aria-labelledby="category-modal-title"
            aria-modal="true"
            className="modal-panel"
            role="dialog"
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Category</p>
                <h3 id="category-modal-title">
                  {categoryForm.categoryId ? "Edit category" : "New category"}
                </h3>
              </div>
              <button
                aria-label="Close category modal"
                className="modal-close"
                onClick={closeCategoryModal}
                type="button"
              >
                X
              </button>
            </div>
            <div className="form-grid">
              <label>
                <span>Name</span>
                <input
                  onChange={(event) =>
                    setCategoryForm((current) => ({ ...current, title: event.target.value }))
                  }
                  ref={categoryNameInputRef}
                  value={categoryForm.title}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="secondary-action" onClick={closeCategoryModal} type="button">
                Cancel
              </button>
              <button
                className="primary-action"
                disabled={pending || !categoryForm.title.trim()}
                onClick={saveCategory}
                type="button"
              >
                {pending ? "Saving" : categoryForm.categoryId ? "Save changes" : "Create category"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}

function formatSubmittedAt(value: string | null) {
  if (!value) return "Submitted";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Submitted";

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function VoteSubmissionPanel({ model }: { model: AwardPortalModel }) {
  const { pending, submitted } = model.voteSubmissions;

  return (
    <div className="queue-block result-admin-block">
      <div className="queue-head">
        <h3>Vote submissions</h3>
        <small>
          {submitted.length}/{submitted.length + pending.length} submitted
        </small>
      </div>
      <div className="vote-submission-grid">
        <div className="submission-column">
          <div className="queue-head compact-queue-head">
            <h4>Submitted votes</h4>
            <small>{submitted.length}</small>
          </div>
          <div className="mini-list">
            {submitted.length === 0 ? <EmptyState message="No votes submitted yet." /> : null}
            {submitted.map((member) => (
              <article className="mini-row submission-row" key={member.memberId}>
                <PersonAvatar member={member} name={member.name} />
                <span>
                  <strong>{member.name}</strong>
                  <small>{formatSubmittedAt(member.submittedAt)}</small>
                </span>
              </article>
            ))}
          </div>
        </div>
        <div className="submission-column">
          <div className="queue-head compact-queue-head">
            <h4>Pending votes</h4>
            <small>{pending.length}</small>
          </div>
          <div className="mini-list">
            {pending.length === 0 ? <EmptyState message="Everyone has submitted." /> : null}
            {pending.map((member) => (
              <article className="mini-row submission-row" key={member.memberId}>
                <PersonAvatar member={member} name={member.name} />
                <span>
                  <strong>{member.name}</strong>
                  <small>Pending</small>
                </span>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TieDecisionRow({
  category,
  hasRunoff,
  result,
}: {
  category: Category;
  hasRunoff: boolean;
  result: PrivateResult;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  useAutoDismissMessage(message, setMessage);
  const tiedNominees = (result.totals ?? [])
    .filter((total) => result.count > 0 && total.voteCount === result.count)
    .map((total) => total.displayName);

  function acceptJointWinners() {
    setMessage(null);
    startTransition(async () => {
      const actionResult = (await acceptTiedWinnersAction(category.id)) as PortalResult;
      setMessage(
        actionResult.ok
          ? "Joint winners accepted."
          : actionResult.error ?? "Unable to accept joint winners.",
      );
      if (actionResult.ok) router.refresh();
    });
  }

  function createRunoff() {
    setMessage(null);
    startTransition(async () => {
      const result = (await createRunoffAction(category.id)) as PortalResult;
      setMessage(result.ok ? "Runoff ballot created." : result.error ?? "Unable to create runoff.");
      if (result.ok) router.refresh();
    });
  }

  return (
    <article className="mini-row category-action-row tie-decision-row">
      <span>
        <strong>{category.title}</strong>
        <small>
          {tiedNominees.join(", ")} / {result.count} votes
        </small>
        {hasRunoff ? <small>Runoff ballot already created.</small> : null}
        {message ? <small className="inline-message">{message}</small> : null}
      </span>
      <div className="row-actions">
        <button
          className="secondary-action"
          disabled={pending || hasRunoff}
          onClick={createRunoff}
          type="button"
        >
          Create runoff
        </button>
        <button
          className="primary-action"
          disabled={pending || hasRunoff}
          onClick={acceptJointWinners}
          type="button"
        >
          Publish as joint winners
        </button>
      </div>
    </article>
  );
}

function AdminQueues({ model }: { model: AwardPortalModel }) {
  const draftNomineeCount = model.finalistReview.reduce(
    (total, group) =>
      total + group.finalists.filter((finalist) => finalist.status === "draft").length,
    0,
  );
  const approvedNomineeCount = model.finalistReview.reduce(
    (total, group) =>
      total + group.finalists.filter((finalist) => finalist.status === "approved").length,
    0,
  );
  const nominationGroups = useMemo(
    () =>
      groupNominationsByNominator({
        categories: model.categories,
        members: model.members,
        nominations: model.nominations,
      }) as NominationReviewGroup[],
    [model.categories, model.members, model.nominations],
  );
  const categoryById = useMemo(
    () => new Map(model.categories.map((category) => [category.id, category])),
    [model.categories],
  );
  const tieDecisions = useMemo(
    () =>
      model.privateResults
        .map((result) => {
          const category = categoryById.get(result.categoryId);
          const tiedNominees = result.totals?.filter(
            (total) => result.count > 0 && total.voteCount === result.count,
          );
          const hasRunoff = model.categories.some(
            (candidate) =>
              candidate.active &&
              candidate.kind === "runoff" &&
              candidate.parentCategoryId === result.categoryId,
          );

          if (
            !category ||
            category.kind === "runoff" ||
            !["tie", "tie-check"].includes(result.status) ||
            !tiedNominees ||
            tiedNominees.length < 2
          ) {
            return null;
          }

          return { category, hasRunoff, result };
        })
        .filter(Boolean) as { category: Category; hasRunoff: boolean; result: PrivateResult }[],
    [categoryById, model.categories, model.privateResults],
  );
  const showVoteSubmissions =
    model.cycle.stage === "Voting" ||
    model.cycle.stage === "Certification" ||
    model.cycle.stage === "Published" ||
    model.progress.voteReceiptCount > 0;

  return (
    <section className="panel wide-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Review</p>
          <h2>Nomination review</h2>
        </div>
      </div>
      <div className="admin-columns">
        <div className="queue-block">
          <div className="queue-head">
            <h3>Submitted nominations</h3>
            <small>{nominationGroups.length} ballots</small>
          </div>
          <div className="mini-list">
            {nominationGroups.length === 0 ? (
              <EmptyState message="No nominations submitted yet." />
            ) : null}
            {nominationGroups.map((group) => (
              <article className="mini-row review-row nomination-review-card" key={group.nominatorId}>
                <PersonAvatar member={group.nominator} name={group.nominatorName} />
                <span>
                  <strong>{group.nominatorName}</strong>
                  <small>{group.nominations.length} categories submitted</small>
                  <div className="nomination-choice-list">
                    {group.nominations.map((nomination) => (
                      <div className="nomination-choice" key={nomination.id}>
                        <strong>{nomination.categoryTitle}</strong>
                        <small>{nomination.nomineeName}</small>
                      </div>
                    ))}
                  </div>
                </span>
                <StagePill stage="Submitted" />
              </article>
            ))}
          </div>
        </div>
        <div className="queue-block">
          <div className="queue-head">
            <h3>Voting nominees</h3>
            <small>
              {approvedNomineeCount} prepared automatically
              {draftNomineeCount ? ` / ${draftNomineeCount} legacy drafts` : ""}
            </small>
          </div>
          <div className="mini-list">
            {model.finalistReview.length === 0 ? (
              <EmptyState message="Voting nominees appear automatically after nominations complete." />
            ) : null}
            {model.finalistReview.map((group) => (
              <article className="mini-row review-row" key={group.category.id}>
                <span>
                  <strong>{group.category.title}</strong>
                  <small>
                    {group.finalists.filter((finalist) => finalist.status === "approved").length
                      ? group.finalists
                          .filter((finalist) => finalist.status === "approved")
                          .map(
                            (finalist) =>
                              `${finalist.displayName} (${finalist.nominationCount})`,
                          )
                          .join(", ")
                      : "Waiting for completed nominations"}
                  </small>
                </span>
                <StagePill
                  stage={
                    group.finalists.some((finalist) => finalist.status === "approved")
                      ? "Ready"
                      : "Pending"
                  }
                />
              </article>
            ))}
          </div>
        </div>
      </div>
      {showVoteSubmissions ? <VoteSubmissionPanel model={model} /> : null}
      <div className="queue-block result-admin-block">
        <div className="queue-head">
          <h3>Private results</h3>
          {model.hasUnresolvedTies ? <small>Runoff required</small> : null}
        </div>
        <div className="mini-list">
          {model.privateResults.map((result) => (
            <article className="mini-row result-review-row" key={result.category}>
              <span>
                <strong>{result.category}</strong>
                <small>
                  {result.status === "tie-check" || result.status === "tie"
                    ? "Tie"
                    : result.leader}{" "}
                  / {result.count} votes
                </small>
              </span>
              <StagePill stage={result.status} />
            </article>
          ))}
        </div>
      </div>
      {tieDecisions.length > 0 ? (
        <div className="queue-block result-admin-block">
          <div className="queue-head">
            <h3>Tie decision</h3>
            <small>{tieDecisions.length} tied category</small>
          </div>
          <div className="mini-list">
            {tieDecisions.map(({ category, hasRunoff, result }) => (
              <TieDecisionRow
                category={category}
                hasRunoff={hasRunoff}
                key={category.id}
                result={result}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function AdminAwardsPage({
  currentUser,
  model,
}: {
  currentUser: CurrentUser;
  model: AwardPortalModel;
}) {
  return (
    <main className="app-shell">
      <Header active="admin" />
      <section className="member-hero">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Control room</h1>
          <p>Cycle, roster, finalists, results.</p>
        </div>
        <ProfilePill currentUser={currentUser} />
      </section>
      <section className="admin-grid">
        <AdminCycle model={model} />
        <AdminCategoryManager model={model} />
        <AdminRoster model={model} />
        <AdminQueues model={model} />
      </section>
    </main>
  );
}
