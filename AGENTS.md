<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## UI architecture
- Use the shared semantic tokens, Button, PageHeader, Panel and table controls for every employee module; visual refinements must not modify service rules or data relationships.
- Keep customer overview sections in the shared unboxed summary workspace and preserve URL-backed profile tabs, so detailed records remain accessible without fragmented containers.
- Use SelectField to restyle existing select fields while retaining their option values and event handlers; shared dropdown presentation prevents inconsistent native controls.
