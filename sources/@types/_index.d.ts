declare module "*.md" {
	const value: PromiseLike<string>
	export default value
}
declare module "worker:*" {
	const value: string
	export default value
}
