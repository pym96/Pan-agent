// Untrusted child text is classified, never copied to controller evidence.
export const STDERR_LIMIT=65536;
export function classifyDiagnostic(text){
 if(text.includes('all predefined address pools have been fully subnetted'))return 'docker_address_pool_exhausted';
 if(/Cannot connect to the Docker daemon|docker_operation_failed|Is the docker daemon running/.test(text))return 'docker_daemon_unavailable';
 if(/No such image|pull access denied/.test(text))return 'docker_image_unavailable';
 if(/task_source_/.test(text))return 'task_source_invalid';
 if(/No such file or directory|FileNotFoundError/.test(text))return 'required_path_missing';
 return text?'unclassified_child_error':'no_child_stderr';
}
export function safeStage(value){return ['source_validation','daemon_connection','compose_create','inspect_audit','ready','runtime','cleanup'].includes(value)?value:'unknown';}
