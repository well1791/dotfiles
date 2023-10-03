function gbd --wraps="git branch | sed 's/^[+*].*//g' | xargs git branch -D" --description "Remove all local untracked branches"
  git branch | sed 's/^[+*].*//g' | xargs git branch -D $argv
end
