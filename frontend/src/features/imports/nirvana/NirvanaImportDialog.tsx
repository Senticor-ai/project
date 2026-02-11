import { ImportDialog } from "../shared/ImportDialog";
import type { ImportDialogProps } from "../shared/ImportDialog";
import { nirvanaConfig } from "./useNirvanaImport";

export type NirvanaImportDialogProps = Omit<ImportDialogProps, "config">;

export function NirvanaImportDialog(props: NirvanaImportDialogProps) {
  return <ImportDialog {...props} config={nirvanaConfig} />;
}
