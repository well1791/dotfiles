# Binaries installed via `go install` land in $GOPATH/bin (~/go/bin)
if test -d ~/go/bin
    set -a PATH ~/go/bin
end
