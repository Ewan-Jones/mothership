interface WorkflowVersionsProps {
  workflowId: string;
  onEditWorkflow: (workflowId: string) => void;
}

export function WorkflowVersions({ workflowId }: WorkflowVersionsProps) {
  return (
    <div style={{ padding: 24 }}>
      <p style={{ color: "#9ca3af", fontSize: 13 }}>版本历史（开发中）— workflowId: {workflowId}</p>
    </div>
  );
}
