/** Identity until W8 wires MLflow: wraps the Agent SDK `query` when MLFLOW_EXPERIMENT_ID is set. */
export const tracedQuery = <Q>(q: Q): Q => q;
