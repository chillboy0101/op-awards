"use client";

import { SignOutButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  approveFinalistsAction,
  certifyResultsAction,
  createNominationsAction,
  createRunoffAction,
  deleteCategoryAction,
  publishWinnersAction,
  submitBallotAction,
  syncClerkRosterAction,
  updateCycleStageAction,
  upsertCategoryAction,
} from "@/app/actions";
import { getMemberPhaseAccess } from "@/lib/awards/phase";
import { buildNominationDirectory } from "@/lib/awards/workflow.mjs";
import type { Category, Finalist, Member } from "@/lib/awards/data";
import type { AwardPortalModel } from "@/lib/awards/repository";
import type { CurrentUser } from "@/lib/auth/service";

type VoteSelections = Record<string, string>;
type DirectoryMember = Member & { isSelf: boolean; selectable: boolean };
type NominationDraft = { nomineeId: string; statement: string };
type PortalResult = {
  count?: number;
  demo?: boolean;
  error?: string;
  ok: boolean;
  confirmationCode?: string;
};

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

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
  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="O&P Awards home">
        <Mark />
      </Link>
      <nav className="nav-links" aria-label="O&P Awards navigation">
        <Link className={active === "public" ? "is-active" : ""} href="/">
          Public
        </Link>
        <Link className={active === "member" ? "is-active" : ""} href="/member">
          Awards Portal
        </Link>
        {active === "admin" ? (
          <Link className={active === "admin" ? "is-active" : ""} href="/admin">
            Admin
          </Link>
        ) : null}
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

function PublicWinners({ model }: { model: AwardPortalModel }) {
  const published = model.cycle.stage === "Published";
  const winners = model.results.filter((result) => published && result.leader !== "Pending");

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Results</p>
          <h2>{published ? "Winners" : "Pending"}</h2>
        </div>
        {published ? <StagePill stage="Published" /> : null}
      </div>
      {published ? (
        <div className="celebration-scene" aria-label="Winner celebration">
          <span className="confetti confetti-a" />
          <span className="confetti confetti-b" />
          <span className="confetti confetti-c" />
          <span className="confetti confetti-d" />
          <div>
            <h3>Congratulations</h3>
            <p>{winners.length ? "The honorees are live." : "Results are published."}</p>
          </div>
        </div>
      ) : null}
      <div className="result-list">
        {model.results.map((result) => (
          <div className="result-row" key={result.category}>
            <span>{result.category}</span>
            <strong>{published ? result.leader : "Not published"}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function getStageAction(stage: string) {
  const access = getMemberPhaseAccess(stage);

  if (access.canNominate) return "Nomination is open until all members complete it.";
  if (access.canVote) return "Voting is open until all members submit.";
  if (access.label === "Published") return "Winners are live.";
  if (access.label === "Review") return "Admin review is in progress.";
  if (access.label === "Certification") return "Results are ready for certification.";

  return "The next cycle is being prepared.";
}

function PublicCycleStatus({ model }: { model: AwardPortalModel }) {
  return (
    <section className="status-strip" aria-label="Current awards status">
      <StagePill stage={model.cycle.stage} />
      <span>{getStageAction(model.cycle.stage)}</span>
    </section>
  );
}

export function PublicAwardsPage({ model }: { model: AwardPortalModel }) {
  return (
    <main className="app-shell">
      <Header active="public" />
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Current cycle</p>
          <h1>{model.cycle.title}</h1>
        </div>
      </section>
      <PublicCycleStatus model={model} />
      <PublicWinners model={model} />
    </main>
  );
}

function CategoryPicker({
  categories,
  completedCategoryIds = new Set<string>(),
  selectedCategory,
  setSelectedCategory,
}: {
  categories: Category[];
  completedCategoryIds?: Set<string>;
  selectedCategory: string;
  setSelectedCategory: (categoryId: string) => void;
}) {
  return (
    <div className="chip-row" aria-label="Award categories">
      {categories.map((category) => (
        <button
          className={[
            "choice-chip",
            selectedCategory === category.id ? "is-selected" : "",
            completedCategoryIds.has(category.id) ? "has-selection" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          key={category.id}
          onClick={() => setSelectedCategory(category.id)}
          type="button"
        >
          {category.title}
        </button>
      ))}
    </div>
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
  const filteredMembers = buildNominationDirectory({
    currentMemberId,
    members,
    query,
  }) as DirectoryMember[];

  return (
    <div className="directory-block">
      <input
        aria-label="Search members"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search people"
        type="search"
        value={query}
      />
      <div className="people-list">
        {filteredMembers.map((member) => (
          <button
            aria-label={
              member.isSelf ? `${member.name}, you cannot nominate yourself` : member.name
            }
            className={[
              "person-card",
              selectedNominee === member.id ? "is-selected" : "",
              member.isSelf ? "is-self" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={!member.selectable}
            key={member.id}
            onClick={() => setSelectedNominee(member.id)}
            type="button"
          >
            <PersonAvatar member={member} name={member.name} />
            <span>
              <strong>{member.name}</strong>
            </span>
            {member.isSelf ? <span className="self-badge">You</span> : null}
          </button>
        ))}
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
  const activeCategories = model.categories.filter((category) => category.active);
  const firstCategoryId = activeCategories[0]?.id ?? "";
  const [selectedCategory, setSelectedCategory] = useState(firstCategoryId);
  const [nominationDrafts, setNominationDrafts] = useState<Record<string, NominationDraft>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const selectedDraft = nominationDrafts[selectedCategory] ?? { nomineeId: "", statement: "" };
  const completedCategoryIds = new Set(
    activeCategories
      .filter((category) => Boolean(nominationDrafts[category.id]?.nomineeId))
      .map((category) => category.id),
  );
  const allCategoriesSelected =
    activeCategories.length > 0 &&
    activeCategories.every((category) => Boolean(nominationDrafts[category.id]?.nomineeId));

  function updateDraft(categoryId: string, patch: Partial<NominationDraft>) {
    setNominationDrafts((current) => ({
      ...current,
      [categoryId]: {
        nomineeId: current[categoryId]?.nomineeId ?? "",
        statement: current[categoryId]?.statement ?? "",
        ...patch,
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
          statement: nominationDrafts[category.id]?.statement ?? "",
        })),
      })) as PortalResult;

      setMessage(
        result.ok
          ? `Saved ${result.count ?? activeCategories.length} nominations.`
          : result.error ?? "Unable to save.",
      );
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="panel work-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Nomination</p>
          <h2>Pick a person</h2>
        </div>
      </div>
      <CategoryPicker
        categories={activeCategories}
        completedCategoryIds={completedCategoryIds}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
      />
      {activeCategories.length === 0 ? <EmptyState message="No active categories yet." /> : null}
      <MemberDirectory
        currentMemberId={currentUser.member.id}
        members={model.members}
        selectedNominee={selectedDraft.nomineeId}
        setSelectedNominee={(memberId) => updateDraft(selectedCategory, { nomineeId: memberId })}
      />
      <label>
        <span>Reason (optional)</span>
        <textarea
          onChange={(event) => updateDraft(selectedCategory, { statement: event.target.value })}
          rows={4}
          value={selectedDraft.statement}
        />
      </label>
      <div className="selection-count">
        {completedCategoryIds.size}/{activeCategories.length} categories selected
      </div>
      <button
        className="primary-action"
        disabled={!allCategoriesSelected || pending}
        onClick={submitNomination}
        type="button"
      >
        {pending ? "Saving" : "Submit nominations"}
      </button>
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
      className={selected ? "finalist-card is-selected" : "finalist-card"}
      onClick={() => setSelected(finalist.id)}
      type="button"
    >
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
  const [pending, startTransition] = useTransition();
  const memberById = useMemo(
    () => new Map(model.members.map((member) => [member.id, member])),
    [model.members],
  );
  const categoriesWithFinalists = model.categories.filter((category) =>
    category.active &&
    model.finalists.some(
      (finalist) => finalist.categoryId === category.id && finalist.status === "approved",
    ),
  );
  const ready =
    categoriesWithFinalists.length > 0 &&
    categoriesWithFinalists.every((category) => selections[category.id]);

  function submitBallot() {
    setMessage(null);
    startTransition(async () => {
      const result = (await submitBallotAction({
        cycleId: model.cycle.id,
        selections,
      })) as PortalResult;

      if (result.ok) {
        setReceipt(result.confirmationCode ?? "OP-RECORDED");
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
          <h2>Tap one finalist</h2>
        </div>
        <StagePill stage="Open" />
      </div>
      <div className="ballot-list">
        {categoriesWithFinalists.map((category) => {
          const finalists = model.finalists.filter(
            (finalist) => finalist.categoryId === category.id && finalist.status === "approved",
          );

          return (
            <section className="ballot-category" key={category.id}>
              <h3>{category.title}</h3>
              <div className="finalist-grid">
                {finalists.map((finalist) => (
                  <FinalistCard
                    category={category}
                    finalist={finalist}
                    key={finalist.id}
                    member={memberById.get(finalist.nomineeId)}
                    selected={selections[category.id] === finalist.id}
                    setSelected={(finalistId) =>
                      setSelections((current) => ({
                        ...current,
                        [category.id]: finalistId,
                      }))
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {categoriesWithFinalists.length === 0 ? <EmptyState message="No ballot is ready yet." /> : null}
      <button className="primary-action" disabled={!ready || pending} onClick={submitBallot} type="button">
        {pending ? "Submitting" : "Submit ballot"}
      </button>
      {receipt ? <div className="notice good">Receipt {receipt}</div> : null}
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

  return (
    <main className="app-shell">
      <Header active="member" />
      <section className="member-hero">
        <div>
          <p className="eyebrow">Awards Portal</p>
          <h1>{access.label}</h1>
          <p>{access.message}</p>
        </div>
        <ProfilePill currentUser={currentUser} />
      </section>
      {access.canNominate ? <NominationExperience currentUser={currentUser} model={model} /> : null}
      {access.canVote ? <VotingExperience model={model} /> : null}
      {!access.canNominate && !access.canVote ? (
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

  function syncRoster() {
    setMessage(null);
    startTransition(async () => {
      const result = (await syncClerkRosterAction()) as PortalResult;
      setMessage(result.ok ? `Synced ${result.count ?? 0} members.` : result.error ?? "Sync failed.");
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Clerk roster</p>
          <h2>Members</h2>
        </div>
        <button className="secondary-action" disabled={pending} onClick={syncRoster} type="button">
          {pending ? "Syncing" : "Sync"}
        </button>
      </div>
      <div className="compact-list">
        {model.members.map((member) => (
          <div className="compact-row" key={member.id}>
            <PersonAvatar member={member} name={member.name} />
            <span>
              <strong>{member.name}</strong>
              <small>{member.email}</small>
            </span>
            <StagePill stage={member.status} />
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
  const progress = model.progress;
  const canOpenNominations = model.cycle.configuredStage === "Draft";
  const canPublish = model.cycle.stage === "Certification";

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
        <span>Review, certification, and publishing stay under admin control.</span>
        {canOpenNominations ? (
          <button className="secondary-action" disabled={pending} onClick={openNominations} type="button">
            Open nominations
          </button>
        ) : null}
        <button
          className="primary-action"
          disabled={pending || !canPublish}
          onClick={publishWinners}
          type="button"
        >
          {pending ? "Publishing" : model.cycle.stage === "Published" ? "Published" : "Publish winners"}
        </button>
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </section>
  );
}

function AdminCategoryManager({ model }: { model: AwardPortalModel }) {
  const blankCategory = {
    active: true,
    categoryId: "",
    finalistLimit: 3,
    title: "",
  };
  const [categoryForm, setCategoryForm] = useState(blankCategory);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function openNewCategory() {
    setMessage(null);
    setCategoryForm(blankCategory);
    setCategoryModalOpen(true);
  }

  function editCategory(category: Category) {
    setMessage(null);
    setCategoryForm({
      active: category.active,
      categoryId: category.id,
      finalistLimit: category.finalistLimit,
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
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Categories</p>
          <h2>Voting categories</h2>
        </div>
        <button className="secondary-action" onClick={openNewCategory} type="button">
          New
        </button>
      </div>
      <div className="compact-list">
        {model.categories.map((category) => (
          <article className="compact-row category-edit-row" key={category.id}>
            <span>
              <strong>{category.title}</strong>
              <small>
                {category.nominationLimit} nomination / {category.finalistLimit} finalists
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
      {categoryModalOpen ? (
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
                  autoFocus
                  onChange={(event) =>
                    setCategoryForm((current) => ({ ...current, title: event.target.value }))
                  }
                  value={categoryForm.title}
                />
              </label>
              <label>
                <span>Finalists</span>
                <input
                  min={1}
                  onChange={(event) =>
                    setCategoryForm((current) => ({
                      ...current,
                      finalistLimit: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={categoryForm.finalistLimit}
                />
              </label>
              <label className="check-row">
                <input
                  checked={categoryForm.active}
                  onChange={(event) =>
                    setCategoryForm((current) => ({ ...current, active: event.target.checked }))
                  }
                  type="checkbox"
                />
                <span>Active</span>
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
        </div>
      ) : null}
    </section>
  );
}

function CategoryActionRow({
  canCertify,
  canReview,
  category,
  finalistCount,
  nominationCount,
}: {
  canCertify: boolean;
  canReview: boolean;
  category: Category;
  finalistCount: number;
  nominationCount: number;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function approveFinalists() {
    setMessage(null);
    startTransition(async () => {
      const result = (await approveFinalistsAction(category.id)) as PortalResult;
      setMessage(
        result.ok
          ? `Approved ${result.count ?? 0} finalists.`
          : result.error ?? "Unable to approve finalists.",
      );
      if (result.ok) router.refresh();
    });
  }

  function createRunoff() {
    setMessage(null);
    startTransition(async () => {
      const result = (await createRunoffAction(category.id)) as PortalResult;
      setMessage(result.ok ? "Runoff noted." : result.error ?? "Unable to create runoff.");
      if (result.ok) router.refresh();
    });
  }

  function certify() {
    setMessage(null);
    startTransition(async () => {
      const result = (await certifyResultsAction(category.id)) as PortalResult;
      setMessage(result.ok ? "Results certified." : result.error ?? "Unable to certify results.");
      if (result.ok) router.refresh();
    });
  }

  return (
    <article className="mini-row category-action-row">
      <span>
        <strong>{category.title}</strong>
        <small>
          {nominationCount} nominations / {finalistCount} approved finalists
        </small>
        {message ? <small className="inline-message">{message}</small> : null}
      </span>
      <div className="row-actions">
        <button
          className="secondary-action"
          disabled={pending || !canReview}
          onClick={approveFinalists}
          type="button"
        >
          Approve top nominees
        </button>
        <button className="secondary-action" disabled={pending} onClick={createRunoff} type="button">
          Runoff
        </button>
        <button className="primary-action" disabled={pending || !canCertify} onClick={certify} type="button">
          Certify
        </button>
      </div>
    </article>
  );
}

function AdminQueues({ model }: { model: AwardPortalModel }) {
  const canReview = model.cycle.stage === "Review";
  const canCertify = model.cycle.stage === "Certification" || model.cycle.stage === "Published";

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
            <small>{model.nominations.length} total</small>
          </div>
          <div className="mini-list">
            {model.nominations.length === 0 ? (
              <EmptyState message="No nominations submitted yet." />
            ) : null}
            {model.nominations.map((nomination) => {
              const nominee = model.members.find((member) => member.id === nomination.nomineeId);
              const nominator = model.members.find(
                (member) => member.id === nomination.nominatorId,
              );
              const category = model.categories.find((item) => item.id === nomination.categoryId);

              return (
                <article className="mini-row review-row" key={nomination.id}>
                  <PersonAvatar member={nominee} name={nominee?.name ?? "Nominee"} />
                  <span>
                    <strong>{nominee?.name ?? "Nominee"}</strong>
                    <small>{category?.title ?? "Category"}</small>
                    <small>Nominated by {nominator?.name ?? "Member"}</small>
                    {nomination.statement ? (
                      <small className="review-note">{nomination.statement}</small>
                    ) : null}
                  </span>
                  <StagePill stage={nomination.status} />
                </article>
              );
            })}
          </div>
        </div>
        <div className="queue-block">
          <div className="queue-head">
            <h3>Finalist decisions</h3>
            <small>Approve after review</small>
          </div>
          <div className="mini-list">
            {model.categories.map((category) => (
              <CategoryActionRow
                canCertify={canCertify}
                canReview={canReview}
                category={category}
                finalistCount={
                  model.finalists.filter(
                    (finalist) =>
                      finalist.categoryId === category.id && finalist.status === "approved",
                  ).length
                }
                key={category.id}
                nominationCount={
                  model.nominations.filter((nomination) => nomination.categoryId === category.id)
                    .length
                }
              />
            ))}
          </div>
        </div>
      </div>
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
        <AdminQueues model={model} />
        <AdminCategoryManager model={model} />
        <AdminRoster model={model} />
      </section>
    </main>
  );
}
