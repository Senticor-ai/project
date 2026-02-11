import { useCallback } from "react";
import {
  useCreateProject,
  useAddProjectAction,
  useCaptureInbox,
  useAddReference,
} from "./use-mutations";
import type { TaySuggestion, CreatedItemRef } from "@/model/chat-types";
import type { CanonicalId } from "@/model/canonical-id";
import type { ItemRecord } from "@/lib/api-client";

export function useTayActions() {
  const createProject = useCreateProject();
  const addProjectAction = useAddProjectAction();
  const captureInbox = useCaptureInbox();
  const addReference = useAddReference();

  const executeSuggestion = useCallback(
    async (suggestion: TaySuggestion): Promise<CreatedItemRef[]> => {
      const created: CreatedItemRef[] = [];

      switch (suggestion.type) {
        case "create_project_with_actions": {
          const projectResult = (await createProject.mutateAsync({
            name: suggestion.project.name,
            desiredOutcome: suggestion.project.desiredOutcome,
          })) as ItemRecord;

          const projectId = projectResult.canonical_id as CanonicalId;
          created.push({
            canonicalId: projectId,
            name: suggestion.project.name,
            type: "project",
          });

          for (const action of suggestion.actions) {
            const actionResult = (await addProjectAction.mutateAsync({
              projectId,
              title: action.name,
            })) as ItemRecord;
            created.push({
              canonicalId: actionResult.canonical_id as CanonicalId,
              name: action.name,
              type: "action",
            });
          }

          if (suggestion.documents) {
            for (const doc of suggestion.documents) {
              const refResult = (await addReference.mutateAsync(
                doc.name,
              )) as ItemRecord;
              created.push({
                canonicalId: refResult.canonical_id as CanonicalId,
                name: doc.name,
                type: "reference",
              });
            }
          }
          break;
        }

        case "create_action": {
          const result = (await captureInbox.mutateAsync(
            suggestion.name,
          )) as ItemRecord;
          created.push({
            canonicalId: result.canonical_id as CanonicalId,
            name: suggestion.name,
            type: "action",
          });
          break;
        }

        case "create_reference": {
          const result = (await addReference.mutateAsync(
            suggestion.name,
          )) as ItemRecord;
          created.push({
            canonicalId: result.canonical_id as CanonicalId,
            name: suggestion.name,
            type: "reference",
          });
          break;
        }
      }

      return created;
    },
    [createProject, addProjectAction, captureInbox, addReference],
  );

  return { executeSuggestion };
}
